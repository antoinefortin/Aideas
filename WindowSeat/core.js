/* Pure calculations shared by the offline dashboard and its tests. */
(function(root){
'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const nullable=v=>finite(v)?v:null;
const radians=v=>v*Math.PI/180;
function distance(a,b){const dlat=radians(b.lat-a.lat),dlon=radians(b.lon-a.lon);const h=Math.sin(dlat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dlon/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)))}
function normalize(position){const c=position.coords;if(!finite(c.latitude)||!finite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!finite(c.accuracy)||c.accuracy<0||!finite(position.timestamp))return null;return {type:'fix',t:position.timestamp,lat:c.latitude,lon:c.longitude,alt:nullable(c.altitude),altAcc:finite(c.altitudeAccuracy)&&c.altitudeAccuracy>=0?c.altitudeAccuracy:null,acc:c.accuracy,speed:finite(c.speed)&&c.speed>=0?c.speed:null,track:finite(c.heading)&&c.heading>=0&&c.heading<360?c.heading:null}}
function acceptedSegment(a,b){if(!a||!b||a.acc>100||b.acc>100)return false;const dt=(b.t-a.t)/1000;return dt>0&&dt<=30&&distance(a,b)/dt<=400}
function totalDistance(fixes){let sum=0;for(let i=1;i<fixes.length;i++)if(acceptedSegment(fixes[i-1],fixes[i]))sum+=distance(fixes[i-1],fixes[i]);return sum}
function verticalTrend(fixes){const b=fixes.at(-1);if(!b||b.alt===null||b.altAcc===null||b.altAcc>100)return null;for(let i=fixes.length-2;i>=0;i--){const a=fixes[i],dt=(b.t-a.t)/1000;if(dt>30)break;if(dt>=10&&a.alt!==null&&a.altAcc!==null&&a.altAcc<=100&&acceptedSegment(a,b))return (b.alt-a.alt)/dt*60}return null}
function pathFor(fixes){let p='',prev=null;for(const f of fixes){const x=(f.lon+180)/360*1000,y=(90-f.lat)/180*500;const connected=prev&&Math.abs(f.lon-prev.lon)<180&&acceptedSegment(prev,f);p+=(connected?'L':'M')+x.toFixed(2)+','+y.toFixed(2);prev=f}return p}
function csv(rows){const keys=['type','t','lat','lon','alt','altAcc','acc','speed','track','alpha','beta','gamma','ax','ay','az','rx','ry','rz','compass','orientationAbsolute','orientationTime','motionTime','text'];return keys.join(',')+'\r\n'+rows.map(r=>keys.map(k=>{const v=r[k];return v==null?'':'"'+String(v).replace(/"/g,'""')+'"'}).join(',')).join('\r\n')}
const api={finite,nullable,distance,normalize,acceptedSegment,totalDistance,verticalTrend,pathFor,csv};if(typeof module!=='undefined')module.exports=api;else root.FlightCore=api;
})(typeof window!=='undefined'?window:globalThis);
