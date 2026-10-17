"""Constants for the HomeKit 风格控制面板 integration."""

DOMAIN = "homekit_panel"

# 侧边栏面板
PANEL_URL_PATH = "homekit"
PANEL_TITLE = "智能家居"
PANEL_ICON = "mdi:home-automation"
PANEL_COMPONENT_NAME = "homekit-panel"

# panel.js 的服务地址(由本集成通过 HTTP 视图提供, 与 /local/ 一样无需认证)
PANEL_MODULE_URL = "/api/homekit_panel/panel.js"

# 配置入口标题
CONFIG_ENTRY_TITLE = "HomeKit 风格控制面板"
