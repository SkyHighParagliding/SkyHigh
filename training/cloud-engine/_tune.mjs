const Ld=3.0, Lm=1.55, Td=7, kLCL=0.22;
// mixed layer / LID / unstable free-trop / UPPER inversion that catches the top / stable
const ENV=[[0,18],[2.0,12],[3.0,13.6],[8.0,3.2],[9.0,4.6],[20,-8]];
const envT=z=>{if(z<=ENV[0][0])return ENV[0][1];for(let i=0;i<ENV.length-1;i++){const[a,ta]=ENV[i],[b,tb]=ENV[i+1];if(z>=a&&z<=b)return ta+(tb-ta)*(z-a)/(b-a);}return ENV.at(-1)[1];};
function solve(Ttrig){
  const zL=Math.max(0,kLCL*(Ttrig-Td));
  const Tl=Ttrig-Ld*zL;
  const P=z=> z<=zL?Ttrig-Ld*z:Tl-Lm*(z-zL);
  let top=0,wasB=false;
  for(let z=0.02;z<=20;z+=0.02){const b=P(z)-envT(z);if(b>0.05)wasB=true;if(wasB&&b<0){top=z;break;}}
  if(wasB&&top===0)top=20;
  return {top,cbase:zL,cloud:zL<top&&top>0.1};
}
console.log('Tg  Top   Cbase  state');
for(const T of [16,18,20,21,22,23,24,26,28,30,33,37,42]){
  const r=solve(T);
  let s=r.top<=0.1?'nolift':r.top<3.4?'CAPPED':r.top>7?'SOARS':'mid';
  console.log(String(T).padStart(3),(r.top*1000).toFixed(0).padStart(6),(r.cbase*1000).toFixed(0).padStart(6),s.padStart(7),r.cloud?'cloud':'blue');
}
