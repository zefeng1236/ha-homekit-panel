"""The HomeKit 风格控制面板 integration.

在 Home Assistant 侧边栏注册一个「智能家居」面板:
- 面板 JS 由本集成通过 HTTP 视图提供(无需认证, 与 /local/ 行为一致)
- 注册后面板会通过 panels_updated 事件实时出现在侧边栏, 无需重启
- 前端通过 hass 对象直接读取状态/调用服务, 不需要任何令牌
"""

from __future__ import annotations

import logging
import os
from typing import Any

from aiohttp import web
from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import HomeAssistantView
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    CONFIG_ENTRY_TITLE,
    DOMAIN,
    PANEL_COMPONENT_NAME,
    PANEL_CONFIG_STORAGE_KEY,
    PANEL_CONFIG_URL,
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


def _validate_config(data: Any) -> str | None:
    """宽松校验面板配置结构, 返回错误信息或 None。"""
    if not isinstance(data, dict):
        return "配置必须是 JSON 对象"
    if data.get("version") != 1:
        return "version 必须为 1"
    rooms = data.get("rooms")
    if not isinstance(rooms, list):
        return "rooms 必须是数组"
    for room in rooms:
        if not isinstance(room, dict) or not isinstance(room.get("name"), str):
            return "房间缺少 name 字段"
        if not isinstance(room.get("devices", []), list):
            return "房间 devices 必须是数组"
        for dev in room["devices"]:
            if not isinstance(dev, dict) or not isinstance(dev.get("entity_id"), str):
                return "设备缺少 entity_id 字段"
    scenes = data.get("scenes", [])
    if not isinstance(scenes, list):
        return "scenes 必须是数组"
    for scene in scenes:
        if not isinstance(scene, dict) or not isinstance(scene.get("label"), str):
            return "场景缺少 label 字段"
        actions = scene.get("actions", [])
        if not isinstance(actions, list):
            return "场景 actions 必须是数组"
        for act in actions:
            if not isinstance(act, dict) or not all(
                isinstance(act.get(k), str) for k in ("domain", "service", "entity_id")
            ):
                return "场景动作缺少 domain/service/entity_id"
    weather = data.get("weather")
    if weather is not None and not isinstance(weather, str):
        return "weather 必须是字符串或 null"
    return None


class PanelConfigView(HomeAssistantView):
    """面板配置的可视化编辑存储: 读取 / 保存 / 重置。

    requires_auth = False: 与 panel.js 视图一致。配置内容仅包含
    实体 ID 与布局, 不含令牌; 且只能由本面板前端读写。
    """

    url = PANEL_CONFIG_URL
    name = "api:homekit_panel:config"
    requires_auth = False

    def __init__(self) -> None:
        self._store: Store | None = None

    def _get_store(self, hass: HomeAssistant) -> Store:
        if self._store is None:
            self._store = Store(hass, 1, PANEL_CONFIG_STORAGE_KEY)
        return self._store

    async def get(self, request: web.Request) -> web.Response:
        """返回已保存的配置; 从未保存过则返回 null。"""
        hass = request.app["hass"]
        data = await self._get_store(hass).async_load()
        return web.json_response({"ok": True, "config": data})

    async def post(self, request: web.Request) -> web.Response:
        """保存面板前端提交的配置。"""
        hass = request.app["hass"]
        try:
            data = await request.json()
        except Exception:  # noqa: BLE001 - 任何解析失败都按 400 处理
            return web.json_response({"ok": False, "error": "请求体不是合法 JSON"}, status=400)

        error = _validate_config(data)
        if error:
            return web.json_response({"ok": False, "error": error}, status=400)

        await self._get_store(hass).async_save(data)
        _LOGGER.debug("面板配置已保存: %d 个房间", len(data.get("rooms", [])))
        return web.json_response({"ok": True})

    async def delete(self, request: web.Request) -> web.Response:
        """清除已保存配置, 恢复内置默认。"""
        hass = request.app["hass"]
        await self._get_store(hass).async_remove()
        return web.json_response({"ok": True})


async def _async_register_panel(hass: HomeAssistant) -> None:
    """注册 panel.js 的 HTTP 视图与侧边栏面板(幂等, 可重复调用)。

    先移除再注册: 保证每次启动都加载最新的 panel.js,
    且 async_setup / async_setup_entry 重复调用时不会冲突。
    """
    if not hass.data.get(DOMAIN, {}).get("js_view_registered"):
        hass.http.register_view(HomeKitPanelJsView())
        hass.http.register_view(PanelConfigView())
        hass.data.setdefault(DOMAIN, {})["js_view_registered"] = True

    async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)

    # 注意: async_register_panel 是协程, 必须 await, 否则面板不会注册
    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT_NAME,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=PANEL_MODULE_URL,
        require_admin=False,
    )
    _LOGGER.debug("已注册 %s 面板: /%s", PANEL_TITLE, PANEL_URL_PATH)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """组件级设置: 注册面板与 JS 视图。"""
    await _async_register_panel(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """配置入口设置: 确保面板已注册(某些启动路径不会调用 async_setup)。"""
    await _async_register_panel(hass)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """删除集成时移除面板。"""
    async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """配置项更新时无需处理。"""
