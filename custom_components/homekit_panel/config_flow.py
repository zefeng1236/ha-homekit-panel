"""Config flow for HomeKit 风格控制面板."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import CONFIG_ENTRY_TITLE, DOMAIN


class HomeKitPanelConfigFlow(ConfigFlow, domain=DOMAIN):
    """无参数配置流程: 用户点击集成即完成添加。"""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """处理用户步骤。"""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        return self.async_create_entry(title=CONFIG_ENTRY_TITLE, data={})
