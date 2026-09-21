import { prezzi } from "../src/base/db.js";
const P=await prezzi(); const n=(v:number)=>v.toLocaleString("it-IT");
const a=await P.countDocuments({p:{$ne:null}}); const t=Date.now();
await new Promise(r=>setTimeout(r,300000));
const b=await P.countDocuments({p:{$ne:null}}); const r=(b-a)/((Date.now()-t)/1000);
console.log(`\n  ${n(a)} -> ${n(b)}   ritmo ${r.toFixed(1)}/s`);
if(r>0.5) console.log(`  ${((2000000-b)/r/3600).toFixed(1)} ore al traguardo\n`);
process.exit(0);
