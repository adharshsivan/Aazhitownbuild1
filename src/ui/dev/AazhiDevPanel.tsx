/**
 * Aazhi Dev Debug Settings Panel
 * Contains all current Aazhi dev controls:
 * - Live telemetry readout
 * - Camera Mode (Walk vs Overview vs Junction Cam)
 * - Optimization & Graphics Mode (Low, Medium, High, Max)
 * - Time of day, Date, Speed & Hour Presets
 * - Lunar Calendar & Moon Age
 * - Weather States & Transition Speed
 * - Rain Levels & Flood / Sea Surge Simulation
 * - Traffic Lights & Junction Controls
 * - Parameter Overrides (Cloud, Rain, Fog, Wind, Storm, Wind Dir)
 * - Lightning Strike, Audio Toggle, Quality & Live Clock
 */
import React from 'react';

export const AazhiDevPanel: React.FC = () => {
  return (
    <div id="wind-debug" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div id="wind-debug-hdr">
        <span>DEV DEBUG · SKY · WEATHER · WORLD</span>
        <button id="wind-debug-close" type="button" title="Close">&times;</button>
      </div>
      <div className="wd-body glass-scrollbar">
        <div className="wd-read" id="sw-read"></div>

        <div className="wd-sec">Camera &amp; View Mode</div>
        <div className="wd-presets" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <button type="button" id="dev-mode-walk" className="wd-btn active">Walk Island</button>
          <button type="button" id="dev-mode-overview" className="wd-btn">Overview</button>
          <button type="button" id="dev-mode-junction" className="wd-btn">Junction Cam</button>
        </div>

        <div className="wd-sec">
          <span>Optimization Mode</span>
          <span id="opt-cur-lbl" style={{ color: 'var(--accent)', textTransform: 'none', letterSpacing: 0 }}>High</span>
        </div>
        <div className="wd-presets" id="sw-opt-bar"></div>
        <div className="opt-desc" id="opt-desc"></div>

        <div className="wd-sec">Time</div>
        <div className="wd-row">
          <div className="wd-lbl"><span>Time of day</span><span id="sw-time-val"></span></div>
          <input id="sw-time" type="range" min="0" max="24" step="0.02" defaultValue="16.5" />
        </div>
        <div className="wd-two">
          <input id="sw-date" type="date" />
          <select id="sw-speed" defaultValue="30">
            <option value="0">Paused</option>
            <option value="1">Real time</option>
            <option value="30">Day = 48 min</option>
            <option value="60">1 min = 1 h</option>
            <option value="72">Day = 20 min</option>
            <option value="720">5 s = 1 h</option>
            <option value="3600">1 s = 1 h</option>
          </select>
        </div>
        <div className="wd-presets">
          <button type="button" data-hour="6.05">Sunrise</button>
          <button type="button" data-hour="12.4">Noon</button>
          <button type="button" data-hour="18.15">Sunset</button>
          <button type="button" data-hour="22.5">Night</button>
        </div>

        <div className="wd-sec">Moon</div>
        <label className="wd-chk"><input id="sw-moon-auto" type="checkbox" defaultChecked /> Real lunar calendar</label>
        <div className="wd-row">
          <div className="wd-lbl"><span>Moon age</span><span id="sw-moon-val"></span></div>
          <input id="sw-moon" type="range" min="0" max="29.5" step="0.1" defaultValue="14" />
        </div>

        <div className="wd-sec">Weather</div>
        <label className="wd-chk"><input id="sw-auto" type="checkbox" defaultChecked /> Automatic (Kerala seasons)</label>
        <div className="wd-presets wd-wx" id="sw-wx"></div>
        <div className="wd-row">
          <div className="wd-lbl"><span>Transition</span><span id="sw-trans-val">4 s</span></div>
          <input id="sw-trans" type="range" min="1" max="60" step="1" defaultValue="4" />
        </div>

        <div id="sw-extreme"></div>

        <div className="wd-sec">Overrides <button type="button" id="sw-reset" className="wd-mini">reset all</button></div>
        <div id="sw-ov"></div>

        <div className="wd-two">
          <button type="button" id="sw-strike" className="wd-btn">Lightning strike</button>
          <button type="button" id="sw-sound" className="wd-btn">Sound: on</button>
        </div>
        <div className="wd-two">
          <button type="button" id="sw-quality" className="wd-btn">Quality: High</button>
          <button type="button" id="sw-now" className="wd-btn">Now (live clock)</button>
        </div>
      </div>
    </div>
  );
};
