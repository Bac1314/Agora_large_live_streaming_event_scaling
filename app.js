(function(){
  const state = {
    product: null,
    rtcUseCase: 'live-streaming',
    mediaType: 'video',
    rtcArea: 'no',
    dualStream: 'no',
    presenceUsed: 'no',
    over512: 'no',
    rtmArea: 'no'
  };

  const AUDIO_PROFILE_BITRATE = {
    'default': 64,
    'speech': 18,
    'music-mono': 64,
    'music-stereo': 80,
    'music-hq-mono': 96,
    'music-hq-stereo': 128
  };

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
  const rtcUseCaseOtherField = document.getElementById('rtcUseCaseOtherField');
  const secRtc = document.getElementById('sec-rtc');
  const secRtm = document.getElementById('sec-rtm');
  const navRtc = document.querySelector('[data-section="sec-rtc"]');
  const navRtm = document.querySelector('[data-section="sec-rtm"]');
  const pcuReadout = document.getElementById('pcuReadout');
  const bandwidthReadout = document.getElementById('bandwidthReadout');

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
    const web = parseInt($('platformSplit').value, 10) || 0;
    $('platformWebLabel').textContent = 'Web ' + web + '%';
    $('platformNativeLabel').textContent = 'Native ' + (100 - web) + '%';
  }

  function syncConditionals(){
    syncPlatformSplit();
    geoRegionField.classList.toggle('show', state.rtcArea === 'yes');
    rtmGeoRegionField.classList.toggle('show', state.rtmArea === 'yes');
    sdkWarning.classList.toggle('show', /^1\./.test($('rtmSdkVersion').value.trim()));
    videoFields.forEach(function(el){ el.classList.toggle('show', state.mediaType === 'video'); });
    lowBitrateField.classList.toggle('show', state.mediaType === 'video' && state.dualStream === 'yes');
    rtcUseCaseOtherField.classList.toggle('show', state.rtcUseCase === 'other');

    secRtc.classList.toggle('hidden-section', !hasRTC());
    secRtm.classList.toggle('hidden-section', !hasRTM());
    navRtc.classList.toggle('hidden-section', !hasRTC());
    navRtm.classList.toggle('hidden-section', !hasRTM());
    pcuReadout.classList.toggle('hidden-section', !hasRTC());
    bandwidthReadout.classList.toggle('hidden-section', !hasRTC());
  }

  const $ = (id) => document.getElementById(id);
  const inputs = ['company','email','appId','eventDate','timezone','startTime','endTime','audienceGeo',
    'rtcUseCaseOther','rtcChannel','peakPCU','peakHosts','hostSdkVersion','audienceSdkVersion',
    'highBitrate','lowBitrate','audioBitrate','platformSplit','hostUid','rtcOpenQuestions',
    'rtmUseCase','rtmChannel','loginQps','channelMsgQps','rtmGeoRegion','rtmSdkVersion','adminUids','rtmOpenQuestions'];

  inputs.forEach(function(id){
    const el = $(id);
    if(el){ el.addEventListener('input', onChange); el.addEventListener('change', onChange); }
  });

  $('audioProfile').addEventListener('change', function(){
    const bitrate = AUDIO_PROFILE_BITRATE[this.value];
    if(bitrate){ $('audioBitrate').value = bitrate; }
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
        reportRequired: bw.gbps >= THRESHOLD || bw.pcu >= 10000
      }
    };

    if(hasRTC()){
      payload.rtc = {
        useCase: state.rtcUseCase === 'other' ? $('rtcUseCaseOther').value.trim() : state.rtcUseCase,
        mediaType: state.mediaType,
        channel: $('rtcChannel').value.trim(),
        peakPCU: Number($('peakPCU').value) || 0,
        peakHosts: Number($('peakHosts').value) || null,
        hostSdkVersions: $('hostSdkVersion').value.trim(),
        audienceSdkVersions: $('audienceSdkVersion').value.trim(),
        areaRestricted: state.rtcArea,
        geoRegion: state.rtcArea === 'yes' ? $('geoRegion').value : null,
        dualStreamMode: state.mediaType === 'video' ? state.dualStream : null,
        highBitrateKbps: state.mediaType === 'video' ? (Number($('highBitrate').value) || 0) : null,
        lowBitrateKbps: (state.mediaType === 'video' && state.dualStream === 'yes') ? (Number($('lowBitrate').value) || 0) : null,
        audioProfile: $('audioProfile').value,
        audioBitrateKbps: Number($('audioBitrate').value) || 0,
        platformWebPct: Number($('platformSplit').value) || 0,
        platformNativePct: 100 - (Number($('platformSplit').value) || 0),
        hostUids: $('hostUid').value.trim(),
        openQuestions: $('rtcOpenQuestions').value.trim()
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
        areaRestricted: state.rtmArea,
        geoRegion: state.rtmArea === 'yes' ? $('rtmGeoRegion').value : null,
        adminUids: $('adminUids').value.trim(),
        openQuestions: $('rtmOpenQuestions').value.trim()
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

  syncConditionals();
  onChange();
  syncHeaderOffset();
  updateScrollspy();
})();
