(function(){
  const state = {
    product: null,
    rtcUseCase: 'live-streaming',
    mediaType: 'video',
    rtcArea: 'no',
    dualStream: 'no',
    presenceUsed: 'no',
    over512: 'no',
    rtmArea: 'no',
    usageTrend: 'ramp-hold'
  };

  const AUDIO_PROFILE_BITRATE = {
    'default': 64,
    'speech': 18,
    'music-mono': 64,
    'music-stereo': 80,
    'music-hq-mono': 96,
    'music-hq-stereo': 128
  };

  // Bitrates (Kbps), keyed by resolution_fps. Source: Agora's Web SDK preset video
  // profiles table (docs.agora.io .../configure-video-encoding/web#video-profiles-table),
  // used as-is (no multiplier). Where a resolution+fps pair has multiple presets, the
  // highest bitrate among them is used (e.g. 1280x720@30fps: 720p_auto=3000 beats
  // 720p_2=2000 and 720p_3=1710).
  const RESOLUTION_BITRATE = {
    '160x120_15': 65,
    '320x180_15': 140,
    '480x272_15': 500,
    '640x360_15': 800,
    '640x360_30': 600,
    '640x480_15': 500,
    '640x480_30': 1000,
    '848x480_15': 610,
    '848x480_30': 930,
    '960x720_15': 910,
    '960x720_30': 1380,
    '1280x720_15': 1130,
    '1280x720_30': 3000,
    '1920x1080_15': 2080,
    '1920x1080_30': 3150,
    '1920x1080_60': 4780
  };

  // ---- usage trends: normalized concurrency shape y(t), t in [0,1] ----
  const TRENDS = [
    {
      key: 'plateau',
      desc: 'Every viewer joins near the start and stays for the whole event — a hard cap, VIP/invite-only stream, or mandatory session. Expected load is close to Maximum.',
      fn: function(){ return 1; }
    },
    {
      key: 'ramp-hold',
      desc: 'Audience builds as the event opens, holds near peak through the main program, then drops off at the end — typical for a scheduled broadcast with a clear start and end.',
      fn: function(t){
        if(t < 0.15) return t / 0.15;
        if(t < 0.85) return 1;
        return Math.max(0, 1 - (t - 0.85) / 0.15 * 0.8);
      }
    },
    {
      key: 'bell',
      desc: 'Viewers trickle in, concurrency climbs to a mid-event peak, then gradually tapers off — common for casual drop-in content with no hard start time.',
      fn: function(t){ return Math.sin(Math.PI * t); }
    },
    {
      key: 'spike-decay',
      desc: 'A rush of viewers right at open (e.g. a countdown or announcement), then a steady decline as people leave early — typical for premieres or single-moment reveals.',
      fn: function(t){
        if(t < 0.08) return t / 0.08;
        return Math.pow(Math.max(0, 1 - (t - 0.08) / 0.92), 1.3);
      }
    }
  ];
  const TRENDS_BY_KEY = {};
  TRENDS.forEach(function(t){ TRENDS_BY_KEY[t.key] = t; });

  function getActiveTrend(){
    return TRENDS_BY_KEY[state.usageTrend] || TRENDS_BY_KEY['ramp-hold'];
  }

  function sampleShape(fn, n){
    const arr = [];
    for(let i = 0; i < n; i++){ arr.push(fn(i / (n - 1))); }
    return arr;
  }

  function shapeFactor(samples){
    return samples.reduce(function(a, b){ return a + b; }, 0) / samples.length;
  }

  function buildChartPaths(samples, w, h, padTop, padBottom){
    const n = samples.length;
    const stepX = w / (n - 1);
    let line = '';
    samples.forEach(function(v, i){
      const x = i * stepX;
      const y = padTop + (1 - v) * (h - padTop - padBottom);
      line += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    line = line.trim();
    const baseline = (h - padBottom).toFixed(1);
    const area = line + ' L ' + w.toFixed(1) + ',' + baseline + ' L 0,' + baseline + ' Z';
    return { line: line, area: area };
  }

  function drawTrendChart(){
    const trend = getActiveTrend();
    const samples = sampleShape(trend.fn, 60);
    const paths = buildChartPaths(samples, 320, 140, 10, 10);
    $('chartLine').setAttribute('d', paths.line);
    $('chartArea').setAttribute('d', paths.area);
  }

  function formatCompact(n){
    if(!n || n <= 0) return '0';
    const abs = Math.abs(n);
    if(abs >= 1e9) return (n / 1e9).toFixed(abs >= 1e10 ? 0 : 1) + 'B';
    if(abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + 'M';
    if(abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + 'K';
    return Math.round(n).toString();
  }

  // segmented control wiring
  document.querySelectorAll('.segmented').forEach(function(group){
    const target = group.getAttribute('data-target');
    group.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        group.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        state[target] = btn.getAttribute('data-value');
        onChange();
      });
    });
  });

  const geoRegionField = document.getElementById('geoRegionField');
  const rtmGeoRegionField = document.getElementById('rtmGeoRegionField');
  const sdkWarning = document.getElementById('sdkWarning');
  const videoFields = document.querySelectorAll('.video-field');
  const lowBitrateField = document.getElementById('lowBitrateField');
  const lowResolutionField = document.getElementById('lowResolutionField');
  const rtcUseCaseOtherField = document.getElementById('rtcUseCaseOtherField');
  const secRtc = document.getElementById('sec-rtc');
  const secRtm = document.getElementById('sec-rtm');
  const navRtc = document.querySelector('[data-section="sec-rtc"]');
  const navRtm = document.querySelector('[data-section="sec-rtm"]');
  const pcuReadout = document.getElementById('pcuReadout');
  const bandwidthReadout = document.getElementById('bandwidthReadout');
  const minutesReadout = document.getElementById('minutesReadout');
  const messagesReadout = document.getElementById('messagesReadout');

  function hasRTC(){ return state.product === 'rtc' || state.product === 'both'; }
  function hasRTM(){ return state.product === 'rtm' || state.product === 'both'; }

  // ---- header height -> monitor sticky offset + card scroll-margin ----
  const siteHeader = document.querySelector('.site-header');
  const monitorEl = document.querySelector('.monitor');
  function syncHeaderOffset(){
    const h = siteHeader.offsetHeight;
    monitorEl.style.top = (h + 16) + 'px';
    document.querySelectorAll('.strip').forEach(function(s){ s.style.scrollMarginTop = (h + 16) + 'px'; });
    return h;
  }
  window.addEventListener('resize', syncHeaderOffset);

  // ---- scrollspy: highlight nav pill for the section in view ----
  const navPills = Array.from(document.querySelectorAll('.nav-pill'));
  const sections = Array.from(document.querySelectorAll('.strip[id]'));
  function updateScrollspy(){
    const headerH = siteHeader.offsetHeight;
    let current = sections[0];
    sections.forEach(function(sec){
      if(sec.getBoundingClientRect().top - headerH <= 8){ current = sec; }
    });
    navPills.forEach(function(p){
      p.classList.toggle('active', p.getAttribute('data-section') === current.id);
    });
  }
  let scrollTicking = false;
  window.addEventListener('scroll', function(){
    if(!scrollTicking){
      window.requestAnimationFrame(function(){ updateScrollspy(); scrollTicking = false; });
      scrollTicking = true;
    }
  });
  navPills.forEach(function(p){
    p.addEventListener('click', function(){
      navPills.forEach(function(o){ o.classList.remove('active'); });
      p.classList.add('active');
    });
  });

  // ---- nav completion: mark a pill done once that section's required fields are filled ----
  function updateNavCompletion(){
    const eventDone = ['company','email','eventDate','startTime','endTime'].every(function(id){
      return $(id).value.trim().length > 0;
    }) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim());
    const rtcDone = hasRTC() && parseFloat($('peakPCU').value) > 0;

    document.querySelector('[data-section="sec-event"]').classList.toggle('complete', eventDone);
    navRtc.classList.toggle('complete', rtcDone);
  }

  function syncPlatformSplit(){
    // slider value = Native % (right side) so dragging right visually increases Native, matching the label it approaches
    const native = parseInt($('platformSplit').value, 10) || 0;
    $('platformWebLabel').textContent = 'Web ' + (100 - native) + '%';
    $('platformNativeLabel').textContent = 'Native ' + native + '%';
  }

  function syncConditionals(){
    syncPlatformSplit();
    geoRegionField.classList.toggle('show', state.rtcArea === 'yes');
    rtmGeoRegionField.classList.toggle('show', state.rtmArea === 'yes');
    sdkWarning.classList.toggle('show', /^1\./.test($('rtmSdkVersion').value.trim()));
    videoFields.forEach(function(el){ el.classList.toggle('show', state.mediaType === 'video'); });
    lowBitrateField.classList.toggle('show', state.mediaType === 'video' && state.dualStream === 'yes');
    lowResolutionField.classList.toggle('show', state.mediaType === 'video' && state.dualStream === 'yes');
    rtcUseCaseOtherField.classList.toggle('show', state.rtcUseCase === 'other');

    secRtc.classList.toggle('hidden-section', !hasRTC());
    secRtm.classList.toggle('hidden-section', !hasRTM());
    navRtc.classList.toggle('hidden-section', !hasRTC());
    navRtm.classList.toggle('hidden-section', !hasRTM());
    pcuReadout.classList.toggle('hidden-section', !hasRTC());
    bandwidthReadout.classList.toggle('hidden-section', !hasRTC());
    minutesReadout.classList.toggle('hidden-section', !hasRTC());
    messagesReadout.classList.toggle('hidden-section', !hasRTM());
  }

  const $ = (id) => document.getElementById(id);
  const inputs = ['company','email','appId','eventDate','timezone','startTime','endTime','audienceGeo',
    'rtcUseCaseOther','rtcChannel','peakPCU','peakHosts','rtcJoinQps','hostSdkVersion','audienceSdkVersion',
    'highBitrate','lowBitrate','audioBitrate','platformSplit','hostUid','rtcOpenQuestions',
    'rtmUseCase','rtmChannel','loginQps','channelMsgQps','rtmReceiveQps','rtmGeoRegion','rtmSdkVersion','adminUids','rtmOpenQuestions'];

  inputs.forEach(function(id){
    const el = $(id);
    if(el){ el.addEventListener('input', onChange); el.addEventListener('change', onChange); }
  });

  $('audioProfile').addEventListener('change', function(){
    const bitrate = AUDIO_PROFILE_BITRATE[this.value];
    if(bitrate){ $('audioBitrate').value = bitrate; }
    onChange();
  });

  $('highResolution').addEventListener('change', function(){
    const bitrate = RESOLUTION_BITRATE[this.value];
    if(bitrate){ $('highBitrate').value = bitrate; }
    onChange();
  });

  $('lowResolution').addEventListener('change', function(){
    const bitrate = RESOLUTION_BITRATE[this.value];
    if(bitrate){ $('lowBitrate').value = bitrate; }
    onChange();
  });

  function pad(n){ return n.toString().padStart(2,'0'); }

  function computeDuration(){
    const d = $('eventDate').value;
    const s = $('startTime').value;
    const e = $('endTime').value;
    if(!d || !s || !e) return null;
    const start = new Date(d + 'T' + s + ':00');
    let end = new Date(d + 'T' + e + ':00');
    if(end <= start) end = new Date(end.getTime() + 24*60*60*1000);
    const ms = end - start;
    const totalMin = Math.round(ms/60000);
    const hh = Math.floor(totalMin/60);
    const mm = totalMin % 60;
    return { hh, mm, hours: totalMin/60 };
  }

  function computeBandwidth(){
    if(!hasRTC()){
      return { gbps: 0, formula: 'N/A — RTC not selected', pcu: 0, hosts: 1 };
    }
    const pcu = parseFloat($('peakPCU').value) || 0;
    const high = parseFloat($('highBitrate').value) || 0;
    const low = parseFloat($('lowBitrate').value) || 0;
    const audio = parseFloat($('audioBitrate').value) || 0;
    const hostsRaw = parseFloat($('peakHosts').value);
    const hosts = (hostsRaw && hostsRaw > 0) ? hostsRaw : 1;
    let perHostStream, formula;

    if(state.mediaType === 'audio-only'){
      perHostStream = audio;
      formula = 'PCU × hosts × audio bitrate kbps (audio-only)';
    } else if(state.dualStream === 'no'){
      perHostStream = high + audio;
      formula = 'PCU × hosts × (high stream + audio kbps)';
    } else {
      perHostStream = high + low + audio;
      formula = 'PCU × hosts × (high + low + audio kbps) — dual stream enabled';
    }

    const totalKbps = pcu * hosts * perHostStream;
    const gbps = totalKbps / 1e6;
    return { gbps, formula, pcu, hosts };
  }

  function computeUsage(){
    const dur = computeDuration();
    const durationMin = dur ? dur.hours * 60 : 0;
    const durationSec = durationMin * 60;
    const factor = shapeFactor(sampleShape(getActiveTrend().fn, 60));

    const pcu = parseFloat($('peakPCU').value) || 0;
    const minMax = pcu * durationMin;
    const minExp = minMax * factor;

    const upQps = parseFloat($('channelMsgQps').value) || 0;
    const dnQps = parseFloat($('rtmReceiveQps').value) || 0;
    const upMax = upQps * durationSec;
    const dnMax = dnQps * durationSec;
    const upExp = upMax * factor;
    const dnExp = dnMax * factor;

    return { factor, minMax, minExp, upMax, upExp, dnMax, dnExp };
  }

  function onChange(){
    syncConditionals();
    updateNavCompletion();

    const dur = computeDuration();
    $('durationOut').textContent = dur ? (pad(dur.hh) + ':' + pad(dur.mm) + ':00') : '00:00:00';

    const pcuVal = $('peakPCU').value;
    $('pcuOut').textContent = pcuVal ? Number(pcuVal).toLocaleString() : '—';

    const bw = computeBandwidth();
    $('bwOut').textContent = bw.gbps.toFixed(2);
    $('formulaOut').textContent = bw.formula;

    const THRESHOLD = 10; // Gbps
    const scaleMax = Math.max(20, bw.gbps * 1.2);
    const pct = Math.min(100, (bw.gbps / scaleMax) * 100);
    const meterFill = $('meterFill');
    meterFill.style.width = pct + '%';
    meterFill.classList.remove('amber','red');
    if(bw.gbps >= THRESHOLD){
      meterFill.classList.add('red');
    } else if(bw.gbps >= THRESHOLD * 0.7){
      meterFill.classList.add('amber');
    }
    $('meterThreshold').style.left = Math.min(100, (THRESHOLD/scaleMax)*100) + '%';

    const reportRequired = bw.gbps >= THRESHOLD || bw.pcu >= 10000;
    $('reportTag').classList.toggle('show', reportRequired);

    drawTrendChart();
    $('trendDesc').textContent = getActiveTrend().desc;
    const usage = computeUsage();
    $('minMaxOut').textContent = formatCompact(usage.minMax) + ' min';
    $('minExpOut').textContent = formatCompact(usage.minExp) + ' min';
    $('upMaxOut').textContent = formatCompact(usage.upMax);
    $('upExpOut').textContent = formatCompact(usage.upExp);
    $('dnMaxOut').textContent = formatCompact(usage.dnMax);
    $('dnExpOut').textContent = formatCompact(usage.dnExp);

    validate();
  }

  function validate(){
    const required = ['company','email','eventDate','startTime','endTime'];
    const missing = [];
    if(!state.product) missing.push('product selection');
    required.forEach(function(id){
      const el = $(id);
      if(!el.value.trim()) missing.push(id);
    });
    if(hasRTC()){
      const pcuOk = parseFloat($('peakPCU').value) > 0;
      if(!pcuOk) missing.push('peakPCU');
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('email').value.trim());
    if($('email').value.trim() && !emailOk) missing.push('email (invalid format)');

    const btn = $('transmitBtn');
    const help = $('transmitHelp');
    const pill = $('statusPill');
    const pillText = $('statusText');

    if(missing.length === 0){
      btn.disabled = false;
      btn.classList.add('ready');
      help.textContent = 'Ready. Download and attach this file to your email to Agora.';
      help.classList.remove('missing');
      pill.classList.add('ready');
      pillText.textContent = 'Ready to transmit';
    } else {
      btn.disabled = true;
      btn.classList.remove('ready');
      help.textContent = 'Missing: ' + missing.join(', ');
      help.classList.add('missing');
      pill.classList.remove('ready');
      pillText.textContent = 'Standby';
    }
    return missing.length === 0;
  }

  function sanitize(str){
    return (str || 'event').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }

  $('transmitBtn').addEventListener('click', function(){
    if(!validate()) return;

    const dur = computeDuration();
    const bw = computeBandwidth();
    const usage = computeUsage();
    const THRESHOLD = 10;

    const payload = {
      meta: {
        generatedAt: new Date().toISOString(),
        formVersion: '1.0'
      },
      product: state.product,
      event: {
        company: $('company').value.trim(),
        email: $('email').value.trim(),
        appId: $('appId').value.trim(),
        eventDate: $('eventDate').value,
        startTime: $('startTime').value,
        endTime: $('endTime').value,
        timezone: $('timezone').value,
        audienceGeo: $('audienceGeo').value.trim()
      },
      computed: {
        durationHours: dur ? Number(dur.hours.toFixed(2)) : null,
        estimatedBandwidthGbps: Number(bw.gbps.toFixed(3)),
        formulaUsed: bw.formula,
        reportRequired: bw.gbps >= THRESHOLD || bw.pcu >= 10000,
        usageTrend: state.usageTrend,
        trendFactor: Number(usage.factor.toFixed(2))
      }
    };

    if(hasRTC()){
      payload.rtc = {
        useCase: state.rtcUseCase === 'other' ? $('rtcUseCaseOther').value.trim() : state.rtcUseCase,
        mediaType: state.mediaType,
        channel: $('rtcChannel').value.trim(),
        peakPCU: Number($('peakPCU').value) || 0,
        peakHosts: Number($('peakHosts').value) || null,
        joinChannelQps: Number($('rtcJoinQps').value) || null,
        hostSdkVersions: $('hostSdkVersion').value.trim(),
        audienceSdkVersions: $('audienceSdkVersion').value.trim(),
        areaRestricted: state.rtcArea,
        geoRegion: state.rtcArea === 'yes' ? $('geoRegion').value : null,
        dualStreamMode: state.mediaType === 'video' ? state.dualStream : null,
        highResolution: state.mediaType === 'video' ? $('highResolution').value : null,
        highBitrateKbps: state.mediaType === 'video' ? (Number($('highBitrate').value) || 0) : null,
        lowResolution: (state.mediaType === 'video' && state.dualStream === 'yes') ? $('lowResolution').value : null,
        lowBitrateKbps: (state.mediaType === 'video' && state.dualStream === 'yes') ? (Number($('lowBitrate').value) || 0) : null,
        audioProfile: $('audioProfile').value,
        audioBitrateKbps: Number($('audioBitrate').value) || 0,
        platformNativePct: Number($('platformSplit').value) || 0,
        platformWebPct: 100 - (Number($('platformSplit').value) || 0),
        hostUids: $('hostUid').value.trim(),
        openQuestions: $('rtcOpenQuestions').value.trim(),
        totalParticipantMinutesMax: Math.round(usage.minMax),
        totalParticipantMinutesExpected: Math.round(usage.minExp)
      };
    }

    if(hasRTM()){
      payload.rtm = {
        useCase: $('rtmUseCase').value.trim(),
        channel: $('rtmChannel').value.trim(),
        presenceUsed: state.presenceUsed,
        over512Users: state.over512,
        sdkVersion: $('rtmSdkVersion').value.trim(),
        loginQps: Number($('loginQps').value) || null,
        channelMsgQps: Number($('channelMsgQps').value) || null,
        receiveQps: Number($('rtmReceiveQps').value) || null,
        areaRestricted: state.rtmArea,
        geoRegion: state.rtmArea === 'yes' ? $('rtmGeoRegion').value : null,
        adminUids: $('adminUids').value.trim(),
        openQuestions: $('rtmOpenQuestions').value.trim(),
        totalMessages: {
          upstreamMax: Math.round(usage.upMax),
          upstreamExpected: Math.round(usage.upExp),
          downstreamMax: Math.round(usage.dnMax),
          downstreamExpected: Math.round(usage.dnExp)
        }
      };
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fname = 'agora-event-intake_' + sanitize($('company').value) + '_' + ($('eventDate').value || 'date') + '.json';
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // ---- info-icon tooltips (viewport-clamped, positioned via JS to avoid clipping) ----
  const gTooltip = document.getElementById('gTooltip');
  function positionTooltip(icon){
    const text = icon.getAttribute('data-tooltip');
    if(!text) return;
    gTooltip.textContent = text;
    const iconRect = icon.getBoundingClientRect();
    const tipRect = gTooltip.getBoundingClientRect();
    let left = iconRect.left + iconRect.width/2 - tipRect.width/2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = iconRect.top - tipRect.height - 8;
    if(top < 8){ top = iconRect.bottom + 8; }
    gTooltip.style.left = left + 'px';
    gTooltip.style.top = top + 'px';
    gTooltip.classList.add('show');
  }
  function hideTooltip(){ gTooltip.classList.remove('show'); }
  document.querySelectorAll('.info-icon').forEach(function(icon){
    icon.addEventListener('mouseenter', function(){ positionTooltip(icon); });
    icon.addEventListener('mouseleave', hideTooltip);
    icon.addEventListener('focus', function(){ positionTooltip(icon); });
    icon.addEventListener('blur', hideTooltip);
  });
  window.addEventListener('scroll', hideTooltip, true);
  window.addEventListener('resize', hideTooltip);

  syncConditionals();
  onChange();
  syncHeaderOffset();
  updateScrollspy();
})();
