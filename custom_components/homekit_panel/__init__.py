"""The HomeKit 风格控制面板 integration.

在 Home Assistant 侧边栏注册一个「智能家居」面板:
- 面板 JS 由本集成通过 HTTP 视图提供(无需认证, 与 /local/ 行为一致)
- 注册后面板会通过 panels_updated 事件实时出现在侧边栏, 无需重启
- 前端通过 hass 对象直接读取状态/调用服务, 不需要任何令牌
"""

from __future__ import annotations

import logging
import os

from aiohttp import web
from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    CONFIG_ENTRY_TITLE,
    DOMAIN,
    PANEL_COMPONENT_NAME,
    PANEL_ICON,
    PANEL_MODULE_URL,
    PANEL_TITLE,
    PANEL_URL_PATH,
)

_LOGGER = logging.getLogger(__name__)


class HomeKitPanelJsView(HomeAssistantView):
    """向前端提供 panel.js。

    requires_auth = False: 与 HA 的 /local/ 静态资源行为一致,
    前端通过 <script type=module> / import() 加载 module_url 时无法携带令牌,
    因此该文件必须公开可读(文件中不含任何敏感信息)。
    """

    url = PANEL_MODULE_URL
    name = "api:homekit_panel:panel_js"
    requires_auth = False

    async def get(self, request: web.Request) -> web.Response:
        """返回 panel.js 文件内容。"""
        js_path = os.path.join(os.path.dirname(__file__), "panel.js")
        try:
            with open(js_path, encoding="utf-8") as file_handle:
                content = file_handle.read()
        except OSError:
            _LOGGER.error("panel.js 不存在: %s", js_path)
            return web.Response(status=404, text="panel.js not found")

        return web.Response(
            body=content,
            content_type="application/javascript",
            charset="utf-8",
            headers={"Cache-Control": "no-store"},
        )


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """注册面板与 JS 视图(组件每次启动时都会执行)。"""
    hass.http.register_view(HomeKitPanelJsView())

    # 幂等: 已注册则先移除再注册, 保证加载最新代码
    async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)

    async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT_NAME,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=PANEL_MODULE_URL,
        require_admin=False,
    )
    _LOGGER.debug("已注册 %s 面板: /%s", PANEL_TITLE, PANEL_URL_PATH)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """配置入口设置完成。"""
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """删除集成时移除面板。"""
    async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """配置项更新时无需处理。"""
