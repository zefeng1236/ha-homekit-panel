/**
 * HomeKit 风格控制面板 — Home Assistant 自定义面板
 * --------------------------------------------------
 * 由 custom_components/homekit_panel 集成提供:
 *   - 状态读取: hass.states (实时, 无需轮询)
 *   - 设备控制: hass.callWS({type:"call_service", ...})
 *   - 令牌: 不需要, 完全运行在 HA 前端会话内
 *
 * 本文件是经典脚本(无 import/export), 以 module_url 加载,
 * 注册自定义元素 <homekit-panel>。
 */
(function () {
  'use strict';

  /* ================= hass 访问层 ================= */

  let HASS = null;

  function entityOf(id) {
    return (HASS && HASS.states && HASS.states[id]) || null;
  }

  function callService(domain, service, data) {
    if (!HASS) return Promise.reject(new Error('hass 尚未就绪'));
    const payload = data || {};
    const serviceData = {};
    for (const key in payload) {
      if (key !== 'entity_id') serviceData[key] = payload[key];
    }
    return HASS.callWS({
      type: 'call_service',
      domain: domain,
      service: service,
      target: payload.entity_id ? { entity_id: payload.entity_id } : undefined,
      service_data: serviceData,
    });
  }

  /* ================= 场景配置 ================= */

  const VACUUM_ID = 'vacuum.roborock_t6';

  const SCENES = [
    {
      label: '全部关灯', icon: 'power', color: 'sc-orange',
      run: async () => {
        const lamps = [
          'light.yeelink_lamp1',
          'light.lemesh_wy0c15',
        ];
        await Promise.allSettled(lamps.map((id) => callService('light', 'turn_off', { entity_id: id })));
      },
    },
    {
      label: '开始清扫', icon: 'play', color: 'sc-green',
      run: () => callService('vacuum', 'start', { entity_id: VACUUM_ID }),
    },
    {
      label: '机器人回充', icon: 'home', color: 'sc-blue',
      run: () => callService('vacuum', 'return_to_base', { entity_id: VACUUM_ID }),
    },
  ];

  /* ================= 房间与设备配置 ================= */

  const ROOMS = [
    {
      id: 'living', name: '客厅', icon: 'sofa',
      devices: [
        {
          type: 'speaker', entity_id: 'media_player.xiaomi_lx04',
          name: '智能音箱', icon: 'speaker', color: 'blue',
        },
        {
          type: 'vacuum', entity_id: VACUUM_ID,
          name: '扫地机器人', icon: 'vacuum', color: 'green', wide: true,
          battery: 'sensor.roborock_t6_battery',
          fan: 'select.roborock_t6_mode',
        },
        {
          type: 'switch', entity_id: 'switch.cuco_cp1d',
          name: '客厅充电插座', icon: 'plug', color: 'gray',
        },
      ],
    },
    {
      id: 'study', name: '书房', icon: 'book',
      devices: [
        {
          type: 'switch-power', entity_id: 'switch.cuco_v3',
          name: 'NAS 智能插座', icon: 'plug', color: 'teal',
          power: 'sensor.cuco_v3_power',
          energy: 'sensor.cuco_v3_energy',
        },
        {
          type: 'sensor-climate', entity_id: 'sensor.miaomiao_t9_temperature',
          name: '米家温湿度计 3', icon: 'thermo', color: 'sky',
          humidity: 'sensor.miaomiao_t9_humidity',
          battery: 'sensor.miaomiao_t9_battery',
        },
      ],
    },
    {
      id: 'bedroom', name: '卧室', icon: 'bed',
      devices: [
        {
          type: 'light-ct', entity_id: 'light.yeelink_lamp1',
          name: '卧室台灯', icon: 'lamp', color: 'amber',
        },
        {
          type: 'light', entity_id: 'light.lemesh_wy0c15',
          name: '卧室氛围灯', icon: 'lamp', color: 'amber',
        },
      ],
    },
    {
      id: 'env', name: '环境与网络', icon: 'leaf',
      devices: [
        {
          type: 'air', entity_id: 'sensor.phicomm_m1_temperature',
          name: '斐讯 M1 空气电台', icon: 'wind', color: 'green', wide: true,
          humidity: 'sensor.phicomm_m1_humidity',
          pm25: 'sensor.phicomm_m1_pm25',
          formaldehyde: 'sensor.phicomm_m1_formaldehyde',
          toggles: [
            { entity_id: 'switch.phicomm_m1_screen', label: '仪表屏幕' },
            { entity_id: 'switch.phicomm_m1_wifi_led', label: 'WiFi 指示灯' },
            { entity_id: 'switch.phicomm_m1_indicator', label: '状态指示灯' },
          ],
        },
      ],
    },
  ];

  const WEATHER_ENTITY = 'weather.home';

  /* ================= 全局状态 ================= */

  const cards = [];
  const usedIds = new Set();
  function use(id) { if (id) usedIds.add(id); return id; }

  /* ================= 工具 ================= */

  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }

  const ICONS = {
    lamp: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.65.55 1 1.4 1 2.3h6c0-.9.35-1.75 1-2.3A7 7 0 0 0 12 2z"/>',
    plug: '<path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
    speaker: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    vacuum: '<circle cx="12" cy="14" r="7"/><circle cx="12" cy="14" r="2.6"/><path d="M12 7V4"/><path d="M8.5 3.5h7"/>',
    router: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.4 15.9a5.4 5.4 0 0 1 7.2 0"/><circle cx="12" cy="19" r="1.2"/><path d="M3 21.5h18"/>',
    thermo: '<path d="M14 14.8V3.5a2.5 2.5 0 0 0-5 0v11.3a4.5 4.5 0 1 0 5 0z"/>',
    drop: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
    wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    battery: '<rect x="1" y="7" width="18" height="10" rx="2.5"/><path d="M23 11v2"/>',
    power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/>',
    home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/>',
    sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 13a2 2 0 0 1 4 0v3h12v-3a2 2 0 0 1 4 0v5H2z"/>',
    bed: '<path d="M2 18v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6"/><path d="M2 18h20"/><path d="M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    leaf: '<path d="M5 19c0-9 6-14 15-15 1 9-4 15-13 15z"/><path d="M5 19c3-5 7-8.5 11-9.5"/>',
    menu: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
    mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    volume: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  };

  function icon(name, size) {
    size = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || ICONS.activity) + '</svg>';
  }

  function round(v, d) {
    if (v === null || v === undefined || isNaN(v)) return null;
    const p = Math.pow(10, d === undefined ? 1 : d);
    return Math.round(v * p) / p;
  }

  function sensorNum(id, digits) {
    const e = entityOf(id);
    if (!e || e.state === 'unavailable' || e.state === 'unknown' || isNaN(parseFloat(e.state))) return null;
    let v = parseFloat(e.state);
    const unit = (e.attributes && e.attributes.unit_of_measurement) || '';
    if (unit === '°F') v = (v - 32) * 5 / 9;
    return { value: round(v, digits === undefined ? 1 : digits), unit: unit === '°F' ? '°C' : unit };
  }

  function isOnline(id) {
    const e = entityOf(id);
    return !!e && e.state !== 'unavailable' && e.state !== 'unknown';
  }

  /* ================= Toast ================= */

  let toastEl = null;
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  /* ================= 组件: 开关 / 滑杆 ================= */

  function makeToggle(initialOn, disabled, onChange) {
    const btn = h('button', 'toggle');
    btn.type = 'button';
    const apply = (on) => {
      btn.classList.toggle('on', !!on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    };
    apply(initialOn);
    btn.disabled = !!disabled;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const willOn = !btn.classList.contains('on');
      apply(willOn);
      Promise.resolve(onChange(willOn)).catch((err) => {
        apply(!willOn);
        toast('操作失败:' + (err && err.message ? err.message : '未知错误'));
      });
    });
    return { el: btn, apply };
  }

  function makeSlider(opts) {
    const row = h('div', 'slider-row');
    const label = h('div', 'slider-label');
    const nameEl = h('span', null, opts.name || '');
    const valEl = h('span', 'val');
    label.appendChild(nameEl);
    label.appendChild(valEl);
    const input = h('input');
    input.type = 'range';
    input.min = opts.min;
    input.max = opts.max;
    input.step = opts.step || 1;
    input.value = opts.value;
    input.disabled = !!opts.disabled;
    row.appendChild(label);
    row.appendChild(input);

    const paint = () => {
      const v = parseFloat(input.value);
      const pct = ((v - opts.min) / (opts.max - opts.min)) * 100;
      input.style.setProperty('--track-bg', opts.track ? opts.track(pct, v) : 'var(--toggle-off)');
      valEl.textContent = opts.format ? opts.format(v) : String(Math.round(v));
    };
    paint();

    input.addEventListener('input', paint);
    input.addEventListener('change', () => {
      if (opts.onCommit) opts.onCommit(parseFloat(input.value));
    });

    return {
      el: row,
      input,
      setValue(v, force) {
        if (!force && (document.activeElement === input || input.matches(':active'))) return;
        input.value = v;
        paint();
      },
      setDisabled(d) { input.disabled = !!d; },
      paint,
    };
  }

  /* ================= 卡片构造器 ================= */

  function cardHead(dev, statusRef) {
    const head = h('div', 'card-head');
    head.innerHTML =
      '<div class="icon-tile tile-' + dev.color + '">' + icon(dev.icon) + '</div>' +
      '<div class="grow"><div class="card-name">' + dev.name + '</div>' +
      '<div class="card-status" data-ref="' + statusRef + '"></div></div>';
    return head;
  }

  function buildSwitch(dev) {
    use(dev.entity_id);
    const card = h('div', 'card');
    const head = cardHead(dev, 'status');
    const toggle = makeToggle(false, true, (on) =>
      callService('switch', on ? 'turn_on' : 'turn_off', { entity_id: dev.entity_id }));
    head.appendChild(toggle.el);
    card.appendChild(head);
    const ref = card.querySelector('[data-ref=status]');
    cards.push({
      update() {
        const e = entityOf(dev.entity_id);
        const offline = !e || e.state === 'unavailable' || e.state === 'unknown';
        card.classList.toggle('offline', offline);
        card.classList.toggle('off', !offline && e.state !== 'on');
        toggle.el.disabled = offline;
        toggle.apply(!offline && e.state === 'on');
        ref.textContent = offline ? '离线' : e.state === 'on' ? '已开启' : '已关闭';
      },
    });
    return card;
  }

  function buildSwitchPower(dev) {
    use(dev.entity_id); use(dev.power); use(dev.energy);
    const card = h('div', 'card');
    const head = cardHead(dev, 'status');
    const toggle = makeToggle(false, true, (on) =>
      callService('switch', on ? 'turn_on' : 'turn_off', { entity_id: dev.entity_id }));
    head.appendChild(toggle.el);
    card.appendChild(head);

    const stats = h('div', 'stat-grid');
    stats.innerHTML =
      '<div class="stat"><div class="k">实时功率</div><div class="v" data-ref="power">--</div></div>' +
      '<div class="stat"><div class="k">累计电量</div><div class="v" data-ref="energy">--</div></div>';
    card.appendChild(stats);

    const refs = {
      status: card.querySelector('[data-ref=status]'),
      power: card.querySelector('[data-ref=power]'),
      energy: card.querySelector('[data-ref=energy]'),
    };

    cards.push({
      update() {
        const e = entityOf(dev.entity_id);
        const offline = !e || e.state === 'unavailable' || e.state === 'unknown';
        const on = !offline && e.state === 'on';
        card.classList.toggle('offline', offline);
        card.classList.toggle('off', !on);
        toggle.el.disabled = offline;
        toggle.apply(on);
        refs.status.textContent = offline ? '离线' : on ? '供电中' : '已关闭';

        const p = sensorNum(dev.power, 1);
        refs.power.innerHTML = p ? p.value + '<small>' + p.unit + '</small>' : '--';
        const en = sensorNum(dev.energy, 2);
        refs.energy.innerHTML = en ? en.value + '<small>' + en.unit + '</small>' : '--';
      },
    });
    return card;
  }

  function buildLight(dev) {
    use(dev.entity_id);
    const card = h('div', 'card');
    const head = cardHead(dev, 'status');
    const toggle = makeToggle(false, true, (on) =>
      callService('light', on ? 'turn_on' : 'turn_off', { entity_id: dev.entity_id }));
    head.appendChild(toggle.el);
    card.appendChild(head);
    const ref = card.querySelector('[data-ref=status]');
    cards.push({
      update() {
        const e = entityOf(dev.entity_id);
        const offline = !e || e.state === 'unavailable' || e.state === 'unknown';
        const on = !offline && e.state === 'on';
        card.classList.toggle('offline', offline);
        card.classList.toggle('off', !on);
        toggle.el.disabled = offline;
        toggle.apply(on);
        ref.textContent = offline ? '离线' : on ? '已开启' : '已关闭';
      },
    });
    return card;
  }

  function buildLightCT(dev) {
    use(dev.entity_id);
    const card = h('div', 'card');
    const head = cardHead(dev, 'status');
    const toggle = makeToggle(false, true, (on) =>
      callService('light', on ? 'turn_on' : 'turn_off', { entity_id: dev.entity_id }));
    head.appendChild(toggle.el);
    card.appendChild(head);

    const bright = makeSlider({
      name: '亮度', min: 1, max: 100, value: 50,
      track: (pct) => 'linear-gradient(to right, var(--text) ' + pct + '%, var(--toggle-off) ' + pct + '%)',
      format: (v) => Math.round(v) + '%',
      onCommit: (v) => callService('light', 'turn_on', { entity_id: dev.entity_id, brightness_pct: Math.round(v) }),
    });
    card.appendChild(bright.el);

    const ct = makeSlider({
      name: '色温', min: 2700, max: 6500, step: 100, value: 4000,
      track: () => 'linear-gradient(to right, #ff9838 0%, #ffd9b0 35%, #eaf4ff 70%, #b7dcff 100%)',
      format: (v) => Math.round(v) + 'K',
      onCommit: (v) => callService('light', 'turn_on', { entity_id: dev.entity_id, color_temp_kelvin: Math.round(v) }),
    });
    card.appendChild(ct.el);

    const chips = h('div', 'chips');
    card.appendChild(chips);

    const refs = { status: card.querySelector('[data-ref=status]') };

    cards.push({
      update() {
        const e = entityOf(dev.entity_id);
        const offline = !e || e.state === 'unavailable' || e.state === 'unknown';
        const on = !offline && e.state === 'on';
        const a = (e && e.attributes) || {};
        card.classList.toggle('offline', offline);
        card.classList.toggle('off', !on);
        toggle.el.disabled = offline;
        toggle.apply(on);
        refs.status.textContent = offline ? '离线' : on ? '已开启' : '已关闭';

        bright.setDisabled(offline);
        ct.setDisabled(offline);
        if (a.brightness) bright.setValue(Math.round((a.brightness / 255) * 100));
        if (a.color_temp_kelvin) ct.setValue(a.color_temp_kelvin);

        const list = a.effect_list || [];
        if (chips.childElementCount !== list.length) {
          chips.innerHTML = '';
          list.forEach((name) => {
            const c = h('button', 'chip', name);
            c.type = 'button';
            c.addEventListener('click', () => {
              callService('light', 'turn_on', { entity_id: dev.entity_id, effect: name })
                .then(() => toast('已切换:' + name))
                .catch((err) => toast('切换失败:' + err.message));
            });
            chips.appendChild(c);
          });
        }
        const cur = a.effect;
        Array.prototype.forEach.call(chips.children, (c) => {
          c.classList.toggle('active', !!cur && c.textContent === cur);
        });
        chips.style.display = on && list.length ? 'flex' : 'none';
      },
    });
    return card;
  }

  function buildSpeaker(dev) {
    use(dev.entity_id);
    const card = h('div', 'card');
    const head = cardHead(dev, 'status');
    const muteBtn = h('button', 'icon-btn');
    muteBtn.type = 'button';
    muteBtn.title = '静音';
    head.appendChild(muteBtn);
    card.appendChild(head);

    const vol = makeSlider({
      name: '音量', min: 0, max: 100, value: 0,
      track: (pct) => 'linear-gradient(to right, #007aff ' + pct + '%, var(--toggle-off) ' + pct + '%)',
      format: (v) => Math.round(v) + '%',
      onCommit: (v) => callService('media_player', 'volume_set', { entity_id: dev.entity_id, volume_level: v / 100 }),
    });
    card.appendChild(vol.el);

    const refs = { status: card.querySelector('[data-ref=status]') };

    muteBtn.addEventListener('click', () => {
      const e = entityOf(dev.entity_id);
      const muted = !!(e && e.attributes && e.attributes.is_volume_muted);
      callService('media_player', 'volume_mute', { entity_id: dev.entity_id, is_volume_muted: !muted })
        .catch((err) => toast('操作失败:' + err.message));
    });

    cards.push({
      update() {
        const e = entityOf(dev.entity_id);
        const offline = !e || e.state === 'unavailable' || e.state === 'unknown';
        const a = (e && e.attributes) || {};
        card.classList.toggle('offline', offline);
        vol.setDisabled(offline);
        if (offline) {
          refs.status.textContent = '离线';
          return;
        }
        const muted = !!a.is_volume_muted;
        muteBtn.innerHTML = icon(muted ? 'mute' : 'volume', 18);
        if (a.volume_level !== undefined && a.volume_level !== null) {
          vol.setValue(Math.round(a.volume_level * 100));
        }
        refs.status.textContent = muted ? '已静音' : '音量 ' + Math.round((a.volume_level || 0) * 100) + '%';
      },
    });
    return card;
  }

  const VAC_STATUS = {
    docked: '已回充', cleaning: '清扫中', paused: '已暂停', returning: '正在回充',
    idle: '待命', error: '异常', unavailable: '离线',
  };
  const VAC_FAN = { Silent: '静音', Basic: '标准', Strong: '强力', 'Full Speed': 'MAX' };

  function buildVacuum(dev) {
    use(dev.entity_id); use(dev.battery); use(dev.fan);
    const card = h('div', 'card' + (dev.wide ? ' wide' : ''));
    const head = cardHead(dev, '');
    card.appendChild(head);

    const body = h('div', 'vacuum-body');
    body.innerHTML =
      '<div class="battery-ring">' +
      '<svg width="74" height="74" viewBox="0 0 74 74">' +
      '<circle class="ring-bg" cx="37" cy="37" r="30" fill="none" stroke-width="6"/>' +
      '<circle class="ring-fg" cx="37" cy="37" r="30" fill="none" stroke-width="6" stroke-linecap="round" ' +
      'stroke-dasharray="188.5" stroke-dashoffset="0" data-ref="ring"/>' +
      '</svg><div class="ring-txt" data-ref="batt">--%</div></div>' +
      '<div class="vacuum-info"><div class="vacuum-state" data-ref="state">--</div>' +
      '<div class="vacuum-sub" data-ref="sub"></div></div>';
    card.appendChild(body);

    const actions = h('div', 'actions');
    const btnStart = h('button', 'btn primary', icon('play', 15) + '开始清扫');
    const btnPause = h('button', 'btn warn', icon('pause', 15) + '暂停');
    const btnDock = h('button', 'btn blue', icon('home', 15) + '回充');
    [btnStart, btnPause, btnDock].forEach((b) => { b.type = 'button'; actions.appendChild(b); });
    card.appendChild(actions);

    const fanSeg = h('div', 'seg');
    fanSeg.style.marginTop = '10px';
    card.appendChild(fanSeg);

    btnStart.addEventListener('click', () =>
      callService('vacuum', 'start', { entity_id: dev.entity_id }).catch((e) => toast(e.message)));
    btnPause.addEventListener('click', () =>
      callService('vacuum', 'pause', { entity_id: dev.entity_id }).catch((e) => toast(e.message)));
    btnDock.addEventListener('click', () =>
      callService('vacuum', 'return_to_base', { entity_id: dev.entity_id }).catch((e) => toast(e.message)));

    const refs = {
      state: card.querySelector('[data-ref=state]'),
      sub: card.querySelector('[data-ref=sub]'),
      batt: card.querySelector('[data-ref=batt]'),
      ring: card.querySelector('[data-ref=ring]'),
    };

    let fanOptions = null;
    cards.push({
      update() {
        const e = entityOf(dev.entity_id);
        const offline = !e || e.state === 'unavailable' || e.state === 'unknown';
        card.classList.toggle('offline', offline);
        card.classList.toggle('off', !offline && e.state !== 'cleaning');
        const st = offline ? 'unavailable' : e.state;
        refs.state.textContent = VAC_STATUS[st] || st;

        const b = sensorNum(dev.battery, 0);
        if (b) {
          refs.batt.textContent = b.value + '%';
          const C = 188.5;
          refs.ring.setAttribute('stroke-dashoffset', String(C * (1 - Math.max(0, Math.min(100, b.value)) / 100)));
          refs.ring.style.stroke = b.value <= 20 ? 'var(--danger)' : 'var(--ok)';
        } else {
          refs.batt.textContent = '--';
        }

        const fe = entityOf(dev.fan);
        const opts = (fe && fe.attributes && fe.attributes.options) || null;
        if (opts && opts !== fanOptions) {
          fanOptions = opts;
          fanSeg.innerHTML = '';
          opts.forEach((opt) => {
            const b = h('button', null, VAC_FAN[opt] || opt);
            b.type = 'button';
            b.dataset.opt = opt;
            b.addEventListener('click', () => {
              callService('select', 'select_option', { entity_id: dev.fan, option: opt })
                .then(() => toast('吸力:' + (VAC_FAN[opt] || opt)))
                .catch((err) => toast('切换失败:' + err.message));
            });
            fanSeg.appendChild(b);
          });
        }
        if (fe) {
          Array.prototype.forEach.call(fanSeg.children, (b) => {
            b.classList.toggle('active', b.dataset.opt === fe.state);
            b.disabled = offline;
          });
        }
        refs.sub.textContent = offline ? '设备离线' : '当前吸力:' + (VAC_FAN[fe && fe.state] || (fe && fe.state) || '--');
        [btnStart, btnPause, btnDock].forEach((b) => { b.disabled = offline; });
      },
    });
    return card;
  }

  function buildSensorClimate(dev) {
    use(dev.entity_id); use(dev.humidity); use(dev.battery);
    const card = h('div', 'card');
    card.appendChild(cardHead(dev, 'sub'));

    const stats = h('div', 'stat-grid');
    stats.innerHTML =
      '<div class="stat"><div class="k">' + icon('thermo', 13) + '温度</div><div class="v" data-ref="temp">--</div></div>' +
      '<div class="stat"><div class="k">' + icon('drop', 13) + '湿度</div><div class="v" data-ref="hum">--</div></div>' +
      '<div class="stat wide"><div class="k">' + icon('battery', 13) + '电池电量</div>' +
      '<div class="v" data-ref="batt" style="font-size:15px">--</div>' +
      '<div class="bar"><i data-ref="bar" style="width:0%"></i></div></div>';
    card.appendChild(stats);

    const refs = {
      sub: card.querySelector('[data-ref=sub]'),
      temp: card.querySelector('[data-ref=temp]'),
      hum: card.querySelector('[data-ref=hum]'),
      batt: card.querySelector('[data-ref=batt]'),
      bar: card.querySelector('[data-ref=bar]'),
    };

    cards.push({
      update() {
        const t = sensorNum(dev.entity_id);
        const hu = sensorNum(dev.humidity, 0);
        const ba = sensorNum(dev.battery, 0);
        const offline = !t;
        card.classList.toggle('offline', offline);
        refs.temp.innerHTML = t ? t.value + '<small>' + t.unit + '</small>' : '--';
        refs.hum.innerHTML = hu ? hu.value + '<small>' + hu.unit + '</small>' : '--';
        if (ba) {
          refs.batt.textContent = ba.value + '%';
          refs.bar.style.width = ba.value + '%';
          refs.bar.className = ba.value <= 20 ? 'bad' : '';
        } else {
          refs.batt.textContent = '--';
        }
        refs.sub.textContent = offline ? '离线' : '在线';
      },
    });
    return card;
  }

  function buildAir(dev) {
    use(dev.entity_id); use(dev.humidity); use(dev.pm25); use(dev.formaldehyde);
    const card = h('div', 'card' + (dev.wide ? ' wide' : ''));
    card.appendChild(cardHead(dev, 'sub'));

    const stats = h('div', 'stat-grid');
    stats.innerHTML =
      '<div class="stat"><div class="k">' + icon('thermo', 13) + '温度</div><div class="v" data-ref="temp">--</div></div>' +
      '<div class="stat"><div class="k">' + icon('drop', 13) + '湿度</div><div class="v" data-ref="hum">--</div></div>' +
      '<div class="stat"><div class="k">' + icon('wind', 13) + 'PM2.5</div><div class="v" data-ref="pm25">--</div>' +
      '<div class="bar"><i data-ref="pm25bar" style="width:0%"></i></div></div>' +
      '<div class="stat"><div class="k">' + icon('activity', 13) + '甲醛</div><div class="v" data-ref="ch2o">--</div>' +
      '<div class="bar"><i data-ref="ch2obar" style="width:0%"></i></div></div>';
    card.appendChild(stats);

    /* 子开关(仪表屏幕 / 指示灯等, 属于同一设备) */
    const subToggles = [];
    if (dev.toggles && dev.toggles.length) {
      const list = h('div', 'switch-list');
      dev.toggles.forEach((t) => {
        const item = h('div', 'switch-item');
        item.appendChild(h('div', null, t.label));
        const tg = makeToggle(false, true, (on) =>
          callService('switch', on ? 'turn_on' : 'turn_off', { entity_id: t.entity_id }));
        item.appendChild(tg.el);
        list.appendChild(item);
        subToggles.push({ spec: t, tg });
      });
      card.appendChild(list);
    }

    const refs = {};
    ['temp', 'hum', 'pm25', 'ch2o', 'pm25bar', 'ch2obar', 'sub'].forEach((k) => {
      refs[k] = card.querySelector('[data-ref=' + k + ']');
    });

    cards.push({
      update() {
        const t = sensorNum(dev.entity_id);
        const hu = sensorNum(dev.humidity, 0);
        const pm = sensorNum(dev.pm25, 0);
        const ch = sensorNum(dev.formaldehyde, 3);
        const offline = !t;
        card.classList.toggle('offline', offline);
        refs.temp.innerHTML = t ? t.value + '<small>' + t.unit + '</small>' : '--';
        refs.hum.innerHTML = hu ? hu.value + '<small>' + hu.unit + '</small>' : '--';
        if (pm) {
          refs.pm25.innerHTML = pm.value + '<small>' + pm.unit + '</small>';
          const pct = Math.min(100, (pm.value / 75) * 100);
          refs.pm25bar.style.width = pct + '%';
          refs.pm25bar.className = pm.value <= 35 ? '' : pm.value <= 75 ? 'warn' : 'bad';
        }
        if (ch) {
          refs.ch2o.innerHTML = ch.value + '<small>' + ch.unit + '</small>';
          const pct = Math.min(100, (ch.value / 0.1) * 100);
          refs.ch2obar.style.width = pct + '%';
          refs.ch2obar.className = ch.value <= 0.08 ? '' : 'bad';
        }
        refs.sub.textContent = offline ? '离线' : '空气正常';

        subToggles.forEach((s) => {
          const se = entityOf(s.spec.entity_id);
          const off = !se || se.state === 'unavailable' || se.state === 'unknown';
          s.tg.el.disabled = off;
          s.tg.apply(!off && se.state === 'on');
        });
      },
    });
    return card;
  }

  function buildRouter(dev) {
    use(dev.entity_id);
    (dev.toggles || []).forEach((t) => use(t.entity_id));
    const card = h('div', 'card');
    card.appendChild(cardHead(dev, 'status'));

    const list = h('div', 'switch-list');
    const sub = [];
    (dev.toggles || []).forEach((t) => {
      const item = h('div', 'switch-item');
      item.appendChild(h('div', null, t.label));
      const tg = makeToggle(false, true, (on) =>
        callService('switch', on ? 'turn_on' : 'turn_off', { entity_id: t.entity_id }));
      item.appendChild(tg.el);
      list.appendChild(item);
      sub.push({ spec: t, tg });
    });
    card.appendChild(list);

    const refs = { status: card.querySelector('[data-ref=status]') };
    cards.push({
      update() {
        const onCount = sub.filter((s) => {
          const e = entityOf(s.spec.entity_id);
          return e && e.state === 'on';
        }).length;
        sub.forEach((s) => {
          const e = entityOf(s.spec.entity_id);
          const off = !e || e.state === 'unavailable' || e.state === 'unknown';
          s.tg.el.disabled = off;
          s.tg.apply(!off && e.state === 'on');
        });
        refs.status.textContent = onCount + ' 个指示灯开启';
      },
    });
    return card;
  }

  function buildBattery(dev) {
    use(dev.entity_id); use(dev.battery_state);
    const card = h('div', 'card');
    card.appendChild(cardHead(dev, 'sub'));

    const stats = h('div', 'stat-grid');
    stats.innerHTML =
      '<div class="stat wide"><div class="k">' + icon('battery', 13) + '当前电量</div>' +
      '<div class="v" data-ref="level" style="font-size:26px">--</div>' +
      '<div class="bar"><i data-ref="bar" style="width:0%"></i></div></div>';
    card.appendChild(stats);

    const STATE_TXT = { discharging: '放电中', charging: '充电中', full: '已充满', none: '未接电源' };
    const refs = {
      sub: card.querySelector('[data-ref=sub]'),
      level: card.querySelector('[data-ref=level]'),
      bar: card.querySelector('[data-ref=bar]'),
    };

    cards.push({
      update() {
        const lv = sensorNum(dev.entity_id, 0);
        const st = entityOf(dev.battery_state);
        const offline = !lv;
        card.classList.toggle('offline', offline);
        if (lv) {
          refs.level.innerHTML = lv.value + '<small>%</small>';
          refs.bar.style.width = Math.max(0, Math.min(100, lv.value)) + '%';
          refs.bar.className = lv.value <= 20 ? 'bad' : lv.value <= 40 ? 'warn' : '';
        }
        refs.sub.textContent = offline
          ? '离线'
          : (STATE_TXT[st && st.state] || (st && st.state) || '') + (lv ? ' · ' + lv.value + '%' : '');
      },
    });
    return card;
  }

  const BUILDERS = {
    switch: buildSwitch,
    'switch-power': buildSwitchPower,
    light: buildLight,
    'light-ct': buildLightCT,
    speaker: buildSpeaker,
    vacuum: buildVacuum,
    'sensor-climate': buildSensorClimate,
    air: buildAir,
    router: buildRouter,
    battery: buildBattery,
  };

  /* ================= 渲染: 场景 / 房间 / 天气 ================= */

  function renderScenes(container) {
    container.innerHTML = '';
    SCENES.forEach((s) => {
      const b = h('button', 'scene-tile ' + s.color);
      b.type = 'button';
      b.innerHTML = icon(s.icon, 24) + '<span>' + s.label + '</span>';
      b.addEventListener('click', async () => {
        b.style.transform = 'scale(.94)';
        setTimeout(() => { b.style.transform = ''; }, 140);
        try {
          await s.run();
          toast(s.label + ' · 已执行');
        } catch (err) {
          toast(s.label + ' 失败:' + (err && err.message ? err.message : '未知错误'));
        }
      });
      container.appendChild(b);
    });
  }

  function renderRooms(container) {
    container.innerHTML = '';
    ROOMS.forEach((room) => {
      const sec = h('section', 'room');
      const title = h('div', 'room-title');
      title.innerHTML = icon(room.icon, 18) + '<span>' + room.name + '</span><span class="room-count" data-ref="count"></span>';
      sec.appendChild(title);
      const grid = h('div', 'grid');
      room.devices.forEach((dev) => {
        const builder = BUILDERS[dev.type];
        if (!builder) {
          grid.appendChild(h('div', 'card', '<div class="card-name">未知类型:' + dev.type + '</div>'));
          return;
        }
        grid.appendChild(builder(dev));
      });
      sec.appendChild(grid);
      container.appendChild(sec);
      room._countEl = title.querySelector('[data-ref=count]');
    });
  }

  function updateAll() {
    cards.forEach((c) => c.update());
    ROOMS.forEach((room) => {
      if (!room._countEl) return;
      let on = 0;
      room.devices.forEach((d) => {
        const e = entityOf(d.entity_id);
        if (e && e.state !== 'unavailable' && e.state !== 'unknown' && e.state !== 'off') on += 1;
      });
      room._countEl.textContent = on + '/' + room.devices.length + ' 在线';
    });
  }

  const WEATHER_ICOS = {
    'clear-night': '🌙', cloudy: '☁️', fog: '🌫', hail: '🌨', lightning: '⛈',
    'lightning-rainy': '⛈', partlycloudy: '⛅', pouring: '🌧', rainy: '🌧',
    snowy: '🌨', 'snowy-rainy': '🌨', sunny: '☀️', windy: '🌬', exceptional: '🌡',
  };
  const WEATHER_TXT = {
    'clear-night': '晴夜', cloudy: '阴', fog: '雾', hail: '冰雹', lightning: '雷电',
    'lightning-rainy': '雷阵雨', partlycloudy: '多云', pouring: '大雨', rainy: '雨',
    snowy: '雪', 'snowy-rainy': '雨夹雪', sunny: '晴', windy: '大风', exceptional: '异常',
  };

  function updateWeather(refs) {
    const e = entityOf(WEATHER_ENTITY);
    if (!e || !refs) return;
    const a = e.attributes || {};
    refs.wico.textContent = WEATHER_ICOS[e.state] || '⛅';
    refs.wico.title = WEATHER_TXT[e.state] || e.state;
    if (a.temperature !== undefined) refs.wtemp.textContent = round(a.temperature, 1) + '°';
    if (a.humidity !== undefined) refs.whum.textContent = '湿度 ' + Math.round(a.humidity) + '%';
  }

  /* ================= 时钟 ================= */

  function tickClock(refs) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    refs.clock.textContent = hh + ':' + mm;
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
    refs.date.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + week;
    const hr = now.getHours();
    refs.greet.textContent = hr < 5 ? '夜深了' : hr < 11 ? '早上好' : hr < 13 ? '中午好' : hr < 18 ? '下午好' : '晚上好';
  }

  /* ================= 主题 ================= */

  function systemIsDark() {
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary-background-color').trim();
      let r, g, b;
      const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hex) {
        const v = hex[1];
        if (v.length === 3) { r = parseInt(v[0] + v[0], 16); g = parseInt(v[1] + v[1], 16); b = parseInt(v[2] + v[2], 16); }
        else { r = parseInt(v.slice(0, 2), 16); g = parseInt(v.slice(2, 4), 16); b = parseInt(v.slice(4, 6), 16); }
      } else {
        const rgb = raw.match(/rgba?\(([^)]+)\)/i);
        if (rgb) {
          const p = rgb[1].split(',').map((x) => parseFloat(x));
          r = p[0]; g = p[1]; b = p[2];
        }
      }
      if (r === undefined || isNaN(r)) return false;
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
    } catch (err) {
      return false;
    }
  }

  function loadThemeMode() {
    try { return localStorage.getItem('hk-panel-theme') || 'auto'; } catch (e) { return 'auto'; }
  }
  function saveThemeMode(m) {
    try { localStorage.setItem('hk-panel-theme', m); } catch (e) { /* ignore */ }
  }

  /* ================= 自定义元素 ================= */

  class HomeKitPanel extends HTMLElement {
    constructor() {
      super();
      this._hass = null;
      this._narrow = false;
      this._panel = null;
      this._built = false;
      this._themeMode = loadThemeMode();
      this.attachShadow({ mode: 'open' });
    }

    set hass(hass) {
      this._hass = hass;
      HASS = hass;
      if (!this._built) {
        this._build();
        this._built = true;
      }
      this._update();
    }
    get hass() { return this._hass; }

    set narrow(value) {
      this._narrow = !!value;
      if (this._root) this._root.classList.toggle('narrow', !!value);
    }
    get narrow() { return this._narrow; }

    set panel(value) { this._panel = value; }
    get panel() { return this._panel; }

    set route(value) { /* 单页面面板, 忽略路由 */ }
    get route() { return undefined; }

    _build() {
      const style = document.createElement('style');
      style.textContent = CSS;
      this.shadowRoot.appendChild(style);

      const root = document.createElement('div');
      root.className = 'hk-app' + (this._narrow ? ' narrow' : '');
      root.setAttribute('data-theme', this._effectiveTheme());
      this.shadowRoot.appendChild(root);
      this._root = root;

      /* ---- 顶栏 ---- */
      const topbar = h('header', 'topbar');
      const menuBtn = h('button', 'icon-btn menu-btn', icon('menu', 18));
      menuBtn.type = 'button';
      menuBtn.title = '打开菜单';
      menuBtn.addEventListener('click', () => {
        this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true }));
      });

      const left = h('div', 'topbar-left');
      left.innerHTML =
        '<div class="panel-title">智能家居</div>' +
        '<div class="clock" data-ref="clock">--:--</div>' +
        '<div class="dateline"><span data-ref="greet">你好</span><span class="dot">·</span><span data-ref="date"></span></div>';

      const right = h('div', 'topbar-right');
      const weather = h('div', 'weather-chip');
      weather.innerHTML =
        '<span class="weather-ico" data-ref="wico">⛅</span>' +
        '<span class="weather-temp" data-ref="wtemp">--°</span>' +
        '<span class="weather-hum" data-ref="whum"></span>';
      const themeBtn = h('button', 'icon-btn');
      themeBtn.type = 'button';
      themeBtn.title = '切换深浅色';

      right.appendChild(weather);
      right.appendChild(themeBtn);
      topbar.appendChild(menuBtn);
      topbar.appendChild(left);
      topbar.appendChild(right);
      root.appendChild(topbar);

      this._refs = {
        clock: left.querySelector('[data-ref=clock]'),
        greet: left.querySelector('[data-ref=greet]'),
        date: left.querySelector('[data-ref=date]'),
        wico: weather.querySelector('[data-ref=wico]'),
        wtemp: weather.querySelector('[data-ref=wtemp]'),
        whum: weather.querySelector('[data-ref=whum]'),
        themeBtn,
      };

      const applyTheme = () => {
        const effective = this._effectiveTheme();
        root.setAttribute('data-theme', effective);
        themeBtn.textContent = effective === 'dark' ? '☀️' : '🌙';
      };
      themeBtn.addEventListener('click', () => {
        const cur = this._effectiveTheme();
        this._themeMode = cur === 'dark' ? 'light' : 'dark';
        saveThemeMode(this._themeMode);
        applyTheme();
      });
      applyTheme();

      /* ---- 场景 ---- */
      const scenes = h('section', 'scenes');
      root.appendChild(scenes);
      renderScenes(scenes);

      /* ---- 房间 ---- */
      const rooms = h('main');
      root.appendChild(rooms);
      renderRooms(rooms);

      /* ---- Toast ---- */
      toastEl = h('div', 'toast');
      root.appendChild(toastEl);

      /* ---- 时钟 ---- */
      tickClock(this._refs);
      this._clockTimer = setInterval(() => tickClock(this._refs), 1000);
    }

    _effectiveTheme() {
      if (this._themeMode === 'light' || this._themeMode === 'dark') return this._themeMode;
      return systemIsDark() ? 'dark' : 'light';
    }

    _update() {
      updateAll();
      updateWeather(this._refs);
    }

    disconnectedCallback() {
      if (this._clockTimer) clearInterval(this._clockTimer);
    }
  }

  customElements.define('homekit-panel', HomeKitPanel);

  /* ================= 样式(Shadow DOM 内) ================= */

  const CSS = `
:host { display: block; }
.hk-app {
  --bg: #f2f3f7;
  --bg-grad: linear-gradient(180deg, #eef1f6 0%, #f2f3f7 240px);
  --card: #ffffff;
  --card-2: #f6f7fa;
  --text: #1c1c1e;
  --text-2: #6e6e73;
  --text-3: #aeaeb2;
  --line: rgba(0, 0, 0, 0.06);
  --shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
  --accent: #34c759;
  --toggle-off: #e5e5ea;
  --chip: #f1f2f6;
  --danger: #ff3b30;
  --warn: #ff9500;
  --ok: #34c759;
  --scene-radius: 22px;
  --card-radius: 20px;

  min-height: 100vh;
  background: var(--bg-grad);
  background-color: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC",
               "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.5;
  transition: background-color .3s, color .3s;
}
.hk-app[data-theme="dark"] {
  --bg: #111114;
  --bg-grad: linear-gradient(180deg, #16161a 0%, #111114 240px);
  --card: #1c1c1f;
  --card-2: #242428;
  --text: #f5f5f7;
  --text-2: #a1a1a6;
  --text-3: #6e6e73;
  --line: rgba(255, 255, 255, 0.08);
  --shadow: 0 1px 2px rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.35);
  --toggle-off: #39393d;
  --chip: #2a2a2e;
}

.hk-app { max-width: 1060px; margin: 0 auto; padding: 22px 18px 40px; }
.hk-app.narrow { padding: 14px 13px 32px; }

/* ---------- HA narrow 模式(手机/折叠屏)适配 ---------- */
.hk-app.narrow .clock { font-size: 34px; }
.hk-app.narrow .weather-hum { display: none; }
.hk-app.narrow .room-title { font-size: 16px; }
.hk-app.narrow .icon-tile { width: 42px; height: 42px; border-radius: 12px; }
.hk-app.narrow .stat .v { font-size: 18px; }
.hk-app.narrow .battery-ring { width: 64px; height: 64px; }
.hk-app.narrow .battery-ring svg { width: 64px; height: 64px; }
.hk-app.narrow .vacuum-body { gap: 12px; }
.hk-app.narrow .btn { padding: 11px 10px; }
.hk-app.narrow .seg button { padding: 8px 4px; }
.hk-app.narrow .scene-tile { width: 84px; height: 84px; }
.hk-app.narrow .toast { bottom: 22px; }

/* ---------- 顶栏 ---------- */
.topbar {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}
.topbar-left { flex: 1; min-width: 0; }
.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: .5px;
  margin-bottom: 2px;
}
.clock {
  font-size: 44px;
  font-weight: 700;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
}
.dateline { color: var(--text-2); font-size: 14px; margin-top: 2px; }
.dateline .dot { margin: 0 6px; color: var(--text-3); }
.topbar-right { display: flex; align-items: center; gap: 10px; padding-top: 6px; }
.menu-btn { display: none; }
.hk-app.narrow .menu-btn { display: grid; }

.weather-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--card);
  border-radius: 999px;
  padding: 8px 14px;
  box-shadow: var(--shadow);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}
.weather-ico { font-size: 17px; }
.weather-hum { color: var(--text-2); font-weight: 500; font-size: 12.5px; }

.icon-btn {
  border: none;
  background: var(--card);
  box-shadow: var(--shadow);
  border-radius: 999px;
  width: 38px; height: 38px;
  font-size: 16px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform .15s;
  color: var(--text);
}
.icon-btn:active { transform: scale(.92); }

/* ---------- 场景快捷区 ---------- */
.scenes {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 2px 2px 12px;
  margin-bottom: 6px;
  scrollbar-width: none;
}
.scenes::-webkit-scrollbar { display: none; }

.scene-tile {
  flex: 0 0 auto;
  width: 96px; height: 96px;
  border-radius: var(--scene-radius);
  border: none;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow);
  transition: transform .15s, filter .15s;
  font-family: inherit;
}
.scene-tile:active { transform: scale(.94); filter: brightness(1.08); }
.scene-tile svg { opacity: .95; }

.sc-amber   { background: linear-gradient(140deg, #ffb340, #ff8a00); }
.sc-orange  { background: linear-gradient(140deg, #ff9f6e, #ff5e3a); }
.sc-blue    { background: linear-gradient(140deg, #5ac8fa, #007aff); }
.sc-green   { background: linear-gradient(140deg, #4cd964, #1f9d4d); }
.sc-teal    { background: linear-gradient(140deg, #6ee7d6, #0fb9a5); }
.sc-purple  { background: linear-gradient(140deg, #c77dfa, #8944ab); }
.sc-indigo  { background: linear-gradient(140deg, #8f9bf3, #5e5ce6); }
.sc-pink    { background: linear-gradient(140deg, #ff6482, #ff2d55); }
.sc-gray    { background: linear-gradient(140deg, #c7c7cc, #8e8e93); }

/* ---------- 房间分区 ---------- */
.room { margin-bottom: 26px; }
.room-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 700;
  margin: 0 2px 12px;
  color: var(--text);
}
.room-title svg { color: var(--text-2); }
.room-title .room-count {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
  margin-left: auto;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.hk-app.narrow .grid { grid-template-columns: 1fr; }

/* ---------- 设备卡片 ---------- */
.card {
  background: var(--card);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
  padding: 16px 16px 14px;
  transition: opacity .25s, transform .15s;
  animation: cardIn .35s ease both;
}
@keyframes cardIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
.card.wide { grid-column: 1 / -1; }
.card.offline { opacity: .62; }
.card.off .icon-tile { filter: grayscale(.9) opacity(.55); }

.card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}
.icon-tile {
  flex: 0 0 auto;
  width: 46px; height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  transition: filter .25s;
}
.tile-amber  { background: linear-gradient(140deg, #ffb340, #ff8a00); }
.tile-orange { background: linear-gradient(140deg, #ff9f6e, #ff5e3a); }
.tile-blue   { background: linear-gradient(140deg, #5ac8fa, #007aff); }
.tile-green  { background: linear-gradient(140deg, #4cd964, #1f9d4d); }
.tile-teal   { background: linear-gradient(140deg, #6ee7d6, #0fb9a5); }
.tile-purple { background: linear-gradient(140deg, #c77dfa, #8944ab); }
.tile-indigo { background: linear-gradient(140deg, #8f9bf3, #5e5ce6); }
.tile-pink   { background: linear-gradient(140deg, #ff6482, #ff2d55); }
.tile-gray   { background: linear-gradient(140deg, #c7c7cc, #8e8e93); }
.tile-sky    { background: linear-gradient(140deg, #64d2ff, #0a84ff); }

.card-name { font-size: 15.5px; font-weight: 650; line-height: 1.25; }
.card-status { font-size: 13px; color: var(--text-2); margin-top: 1px; }
.card-head .grow { flex: 1; min-width: 0; }

.offline-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--chip);
  border-radius: 6px;
  padding: 1px 7px;
  margin-left: 7px;
  vertical-align: 1px;
}

/* iOS 开关 */
.toggle {
  position: relative;
  flex: 0 0 auto;
  width: 50px; height: 30px;
  border-radius: 999px;
  background: var(--toggle-off);
  border: none;
  cursor: pointer;
  transition: background .25s;
}
.toggle::after {
  content: "";
  position: absolute;
  top: 2px; left: 2px;
  width: 26px; height: 26px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 5px rgba(0,0,0,.25);
  transition: transform .25s;
}
.toggle.on { background: var(--accent); }
.toggle.on::after { transform: translateX(20px); }
.toggle:disabled { cursor: default; opacity: .5; }

/* ---------- 滑杆 ---------- */
.slider-row { margin-top: 12px; }
.slider-label {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--text-2);
  margin-bottom: 5px;
  font-variant-numeric: tabular-nums;
}
.slider-label .val { color: var(--text); font-weight: 600; }

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 28px;
  background: transparent;
  cursor: pointer;
  display: block;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 8px;
  border-radius: 999px;
  background: var(--track-bg, var(--toggle-off));
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px; height: 20px;
  border-radius: 999px;
  background: #fff;
  border: none;
  box-shadow: 0 1px 4px rgba(0,0,0,.3);
  margin-top: -6px;
}
input[type="range"]::-moz-range-track {
  height: 8px;
  border-radius: 999px;
  background: var(--track-bg, var(--toggle-off));
}
input[type="range"]::-moz-range-thumb {
  width: 20px; height: 20px;
  border-radius: 999px;
  background: #fff;
  border: none;
  box-shadow: 0 1px 4px rgba(0,0,0,.3);
}
input[type="range"]:disabled { opacity: .45; cursor: default; }

/* ---------- 分段控制 ---------- */
.seg {
  display: flex;
  background: var(--chip);
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
}
.seg button {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 6px 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  transition: background .2s, color .2s;
  font-family: inherit;
  white-space: nowrap;
}
.seg button.active { background: var(--card); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
.seg button:disabled { opacity: .45; cursor: default; }

/* ---------- 动作按钮 ---------- */
.actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.btn {
  flex: 1;
  min-width: 76px;
  border: none;
  border-radius: 12px;
  padding: 9px 10px;
  font-size: 13px;
  font-weight: 650;
  font-family: inherit;
  cursor: pointer;
  background: var(--chip);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform .12s, filter .15s;
}
.btn:active { transform: scale(.96); }
.btn.primary { background: linear-gradient(140deg, #4cd964, #1f9d4d); color: #fff; }
.btn.blue { background: linear-gradient(140deg, #5ac8fa, #007aff); color: #fff; }
.btn.warn { background: linear-gradient(140deg, #ffb340, #ff8a00); color: #fff; }
.btn:disabled { opacity: .45; cursor: default; }

/* ---------- chips(灯效) ---------- */
.chips { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 12px; }
.chip {
  border: none;
  background: var(--chip);
  color: var(--text-2);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background .2s, color .2s;
}
.chip.active { background: var(--text); color: var(--card); }

/* ---------- 传感器数据 ---------- */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 12px;
}
.stat {
  background: var(--card-2);
  border-radius: 14px;
  padding: 10px 12px;
}
.stat .k { font-size: 12px; color: var(--text-2); display: flex; align-items: center; gap: 5px; }
.stat .v { font-size: 20px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
.stat .v small { font-size: 12px; font-weight: 600; color: var(--text-2); margin-left: 2px; }
.stat.wide { grid-column: 1 / -1; }

.bar {
  height: 5px;
  border-radius: 999px;
  background: var(--toggle-off);
  margin-top: 8px;
  overflow: hidden;
}
.bar > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--ok);
  transition: width .4s;
}
.bar > i.warn { background: var(--warn); }
.bar > i.bad { background: var(--danger); }

/* ---------- 扫地机电池环 ---------- */
.vacuum-body { display: flex; align-items: center; gap: 16px; margin-top: 10px; }
.battery-ring { position: relative; flex: 0 0 auto; width: 74px; height: 74px; }
.battery-ring svg { transform: rotate(-90deg); }
.battery-ring .ring-bg { stroke: var(--toggle-off); }
.battery-ring .ring-fg { stroke: var(--ok); transition: stroke-dashoffset .5s; }
.battery-ring .ring-txt {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.vacuum-info { flex: 1; min-width: 0; }
.vacuum-state { font-size: 17px; font-weight: 700; }
.vacuum-sub { font-size: 12.5px; color: var(--text-2); margin-top: 2px; }

/* ---------- 信息 chips 行 ---------- */
.info-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.info-pill {
  background: var(--card-2);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12.5px;
  color: var(--text-2);
  display: flex;
  align-items: center;
  gap: 6px;
}
.info-pill b { color: var(--text); font-weight: 650; }

/* ---------- 多开关列表 ---------- */
.switch-list { margin-top: 12px; display: grid; gap: 2px; }
.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 2px;
  font-size: 14px;
  border-bottom: 1px solid var(--line);
}
.switch-item:last-child { border-bottom: none; }
.switch-item .si-sub { font-size: 12px; color: var(--text-3); margin-top: 1px; }

/* ---------- Toast ---------- */
.toast {
  position: fixed;
  left: 50%;
  bottom: 34px;
  transform: translateX(-50%) translateY(16px);
  background: var(--text);
  color: var(--card);
  font-size: 13.5px;
  font-weight: 600;
  padding: 10px 18px;
  border-radius: 999px;
  box-shadow: 0 8px 30px rgba(0,0,0,.3);
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s, transform .25s;
  z-index: 99;
  max-width: 86vw;
  text-align: center;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

@media (max-width: 640px) {
  .hk-app { padding: 14px 13px 32px; }
  .grid { grid-template-columns: 1fr; }
  .clock { font-size: 34px; }
  .weather-chip { padding: 7px 11px; font-size: 13px; }
  .weather-hum { display: none; }
  .scene-tile { width: 84px; height: 84px; }
  .scenes { gap: 10px; }
  .room-title { font-size: 16px; }
  .icon-tile { width: 42px; height: 42px; border-radius: 12px; }
  .stat .v { font-size: 18px; }
  .battery-ring { width: 64px; height: 64px; }
  .battery-ring svg { width: 64px; height: 64px; }
  .vacuum-body { gap: 12px; }
  .btn { padding: 11px 10px; }
  .seg button { padding: 8px 4px; }
  .toast { bottom: 22px; }
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}
`;
})();
