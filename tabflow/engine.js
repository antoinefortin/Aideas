import { frequencies, normalize } from './settings.js';
const sessions = new Map();
const smooth = (param,value,ctx) => param.setTargetAtTime(value,ctx.currentTime,.025);
function apply(session, value) {
  const s = session.settings = normalize(value), c = session.context;
  session.filters.forEach((node,i) => smooth(node.gain, s.bypass ? 0 : s.bands[i],c));
  smooth(session.bass.gain,s.bypass ? 0 : s.bass,c);
  smooth(session.clarity.gain,s.bypass ? 0 : s.clarity,c);
  smooth(session.volume.gain,s.bypass ? 1 : s.volume/100,c);
  smooth(session.wet.gain,s.bypass ? 0 : s.space/100,c);
  session.input.channelCount = !s.bypass && s.mono ? 1 : 2;
  smooth(session.compressor.threshold,!s.bypass && s.night ? -28 : -2,c);
  smooth(session.compressor.ratio,!s.bypass && s.night ? 8 : 20,c);
  smooth(session.compressor.knee,!s.bypass && s.night ? 20 : 0,c);
}
async function stop(tabId) {
  const s = sessions.get(tabId);
  if (!s) return;
  sessions.delete(tabId);
  s.stream.getTracks().forEach(t => { t.onended = null; t.stop(); });
  await s.context.close();
}
async function start(message) {
  if (sessions.has(message.tabId)) return;
  let stream, context;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource:'tab', chromeMediaSourceId:message.streamId } }, video:false });
    context = new AudioContext();
    const input = context.createGain(); input.channelCountMode = 'explicit'; input.channelInterpretation = 'speakers';
    const source = context.createMediaStreamSource(stream); source.connect(input);
    const filters = frequencies.map(frequency => { const n = context.createBiquadFilter(); n.type='peaking'; n.frequency.value=frequency; n.Q.value=1; return n; });
    let tail = input;
    for (const filter of filters) { tail.connect(filter); tail=filter; }
    const bass=context.createBiquadFilter(); bass.type='lowshelf'; bass.frequency.value=110; tail.connect(bass);
    const clarity=context.createBiquadFilter(); clarity.type='peaking'; clarity.frequency.value=2600; clarity.Q.value=.7; bass.connect(clarity);
    const delay=context.createDelay(1); delay.delayTime.value=.12;
    const wet=context.createGain(); clarity.connect(delay); delay.connect(wet);
    const volume=context.createGain(); clarity.connect(volume); wet.connect(volume);
    const compressor=context.createDynamicsCompressor(); compressor.attack.value=.003; compressor.release.value=.18;
    volume.connect(compressor); compressor.connect(context.destination);
    const session={stream,context,input,filters,bass,clarity,volume,wet,compressor};
    apply(session,message.settings); await context.resume();
    sessions.set(message.tabId,session);
    stream.getAudioTracks()[0].onended=async()=>{ await stop(message.tabId); chrome.runtime.sendMessage({target:'background',type:'ended',tabId:message.tabId}).catch(()=>{}); };
  } catch(error) { stream?.getTracks().forEach(t=>t.stop()); await context?.close(); throw error; }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message.target!=='engine')return;
  (async()=>{
    if(message.type==='start')await start(message);
    if(message.type==='stop')await stop(message.tabId);
    const session=sessions.get(message.tabId);
    if(message.type==='update' && session)apply(session,message.settings);
    return {active:!!session,settings:session?.settings};
  })().then(respond,error=>respond({error:error.message}));
  return true;
});
