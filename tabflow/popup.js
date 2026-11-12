import { defaults, normalize, presets, frequencies } from './settings.js';
const $=id=>document.getElementById(id);
let tabId, active=false, settings=normalize(defaults), changeQueue=Promise.resolve();
const request=async(type,extra={})=>{
  const result=await chrome.runtime.sendMessage({target:'background',type,tabId,...extra});
  if(!result || result.error)throw new Error(result?.error || 'Connexion au moteur interrompue.');
  return result;
};
const error=e=>{ $('status').className='error';$('status').textContent=e.message; };
function render(){
  $('controls').disabled=!active;
  $('power').textContent=active?'Désactiver sur cet onglet':'Activer sur cet onglet';
  $('power').classList.toggle('active',active);
  for(const key of ['volume','bass','clarity','space']){
    $(key).value=settings[key];$(key+'-out').textContent=`${settings[key]} ${key==='volume'||key==='space'?'%':'dB'}`;
  }
  for(const key of ['mono','night','bypass'])$(key).checked=settings[key];
  settings.bands.forEach((value,i)=>{ $('band-'+i).value=value;$('band-out-'+i).textContent=(value>0?'+':'')+value+' dB'; });
  $('preset').value=Object.keys(presets).find(key=>presets[key].every((v,i)=>v===settings.bands[i])) || 'custom';
}
function update(){
  settings=normalize(settings);render();
  const snapshot=structuredClone(settings);
  changeQueue=changeQueue.catch(()=>{}).then(()=>request('update',{settings:snapshot})).catch(error);
}
frequencies.forEach((freq,i)=>{
  const div=document.createElement('div');div.className='band';
  div.innerHTML=`<output id="band-out-${i}">0 dB</output><input id="band-${i}" type="range" min="-12" max="12" step="1" value="0" aria-label="${freq} hertz"><label for="band-${i}">${freq>=1000?freq/1000+'k':freq}</label>`;
  $('eq').append(div);$('band-'+i).oninput=e=>{settings.bands[i]=Number(e.target.value);update();};
});
for(const key of ['volume','bass','clarity','space'])$(key).oninput=e=>{settings[key]=Number(e.target.value);update();};
for(const key of ['mono','night','bypass'])$(key).onchange=e=>{settings[key]=e.target.checked;update();};
$('preset').onchange=e=>{if(presets[e.target.value]){settings.bands=[...presets[e.target.value]];update();}};
$('reset').onclick=()=>{settings=normalize(defaults);update();};
$('power').onclick=async()=>{
  $('power').disabled=true;$('status').className='';
  try{
    await changeQueue;
    const result=await request(active?'stop':'start');active=result.active;
    if(result.settings)settings=normalize(result.settings);
    $('status').textContent=active?'Actif · Les effets restent actifs en fermant ce panneau.':'Désactivé · Lecture normale restaurée.';
    render();
  }catch(e){error(e);}finally{$('power').disabled=false;}
};
(async()=>{
  $('power').disabled=true;
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab.id;
    $('tab-title').textContent=tab.title || 'Onglet actuel';
    const result=await request('status');active=result.active;
    const stored=await chrome.storage.local.get('settings');settings=normalize(result.settings || stored.settings || defaults);
    $('status').textContent=active?'Actif sur cet onglet.':'Active Tabflow pour ajuster le son.';render();
  }catch(e){error(e);}finally{$('power').disabled=false;}
})();
