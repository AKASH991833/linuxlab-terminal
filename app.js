"use strict";
(function(){
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const CFG={ parts:4, memory:256, kernel:"bzImage", diskParts:null };
const LS="linuxlab.progress.v1";
let emulator=null, term, fit, typed="", ctrlArmed=false, ready=false, outBuf=[], raf=0;
const done=new Set(JSON.parse(localStorage.getItem(LS)||"[]"));
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2600)}
function setStat(t,c){$("#stat").textContent=t;$("#dot").className="dot "+(c||"")}

/* ---------- terminal ---------- */
term=new Terminal({fontSize:window.innerWidth<860?13:14,cursorBlink:true,fontFamily:'ui-monospace,Menlo,Consolas,monospace',convertEol:false,scrollback:5000,theme:{background:"#000000",foreground:"#cfe8ee",cursor:"#19f0c8",selectionBackground:"#19f0c855",black:"#04070c",green:"#19f0c8",blue:"#7aa2ff",yellow:"#ffb454",red:"#ff5c7a"}});
fit=new FitAddon.FitAddon();term.loadAddon(fit);term.open($("#term"));
function doFit(){try{fit.fit()}catch(e){}}
addEventListener("resize",doFit);new ResizeObserver(doFit).observe($("#termwrap"));setTimeout(doFit,50);
term.onData(d=>{
  if(ctrlArmed&&d.length===1){const c=d.toUpperCase().charCodeAt(0);if(c>=64&&c<=95){d=String.fromCharCode(c-64)}ctrlArmed=false;$("#kCtrl").classList.remove("armed")}
  send(d);track(d);
});
function send(s){if(emulator&&ready)emulator.serial0_send(s)}
function track(d){for(const ch of d){if(ch==="\r"){check(typed);typed=""}else if(ch==="\x7f"){typed=typed.slice(0,-1)}else if(ch==="\x03"||ch==="\x15"){typed=""}else if(ch>=" "&&ch!=="\x1b"){typed+=ch}}}
function runLine(c){send(c+"\n");check(c)}
function typeLine(c){send(c)}

/* ---------- VM boot ---------- */
async function fetchBuf(url,onp){
  const r=await fetch(url);if(!r.ok)throw new Error(url+" "+r.status);
  const len=+r.headers.get("content-length")||0;const rd=r.body.getReader();const chunks=[];let got=0;
  for(;;){const {done,value}=await rd.read();if(done)break;chunks.push(value);got+=value.length;onp&&onp(got,len)}
  const out=new Uint8Array(got);let o=0;for(const c of chunks){out.set(c,o);o+=c.length}return out.buffer;
}
async function boot(){
  ready=false;setStat("booting","");$("#boot").classList.remove("hide");term.reset();
  const bar=$("#bootbar"),msg=$("#bootmsg"),title=$("#bootTitle");
  title.textContent="Starting virtual machine";
  try{
    const man=await (await fetch("manifest.json",{cache:"no-cache"})).json();
    const total=man.parts.reduce((a,p)=>a+p.size,0)+man.kernel.size;let base=0;
    const prog=(got)=>{const pct=Math.min(99,Math.round((base+got)/total*100));bar.style.width=pct+"%";msg.textContent="Downloading system image... "+pct+"% ("+((base+got)/1048576).toFixed(0)+" / "+(total/1048576).toFixed(0)+" MB, cached after first visit)"};
    const kernel=await fetchBuf(man.kernel.file+"?v="+man.version,g=>prog(g));base+=man.kernel.size;
    const bufs=[];for(const p of man.parts){bufs.push(await fetchBuf(p.file+"?v="+man.version,prog));base+=p.size}
    const disk=new Uint8Array(bufs.reduce((a,b)=>a+b.byteLength,0));let o=0;for(const b of bufs){disk.set(new Uint8Array(b),o);o+=b.byteLength}
    const bios=await fetchBuf("seabios.bin"),vga=await fetchBuf("vgabios.bin");
    bar.style.width="100%";title.textContent="Booting Debian (this takes a while)";msg.textContent="Real systemd boot inside an emulated PC. Typically 1-3 minutes on a phone, faster on a laptop. Watch the log.";
    if(emulator){try{emulator.destroy()}catch(e){}}
    emulator=new V86({wasm_path:"v86.wasm",memory_size:CFG.memory*1024*1024,vga_memory_size:2*1024*1024,bios:{buffer:bios},vga_bios:{buffer:vga},bzimage:{buffer:kernel},hda:{buffer:disk.buffer},filesystem:{},
      cmdline:"console=ttyS0 noapic nolapic tsc=reliable mitigations=off random.trust_cpu=on loglevel=3 systemd.show_status=1 systemd.log_level=warning",autostart:true,disable_keyboard:true,disable_mouse:true});
    let txt="";
    emulator.add_listener("serial0-output-byte",b=>{outBuf.push(b);if(!raf)raf=requestAnimationFrame(flush);
      if(!ready){txt+=String.fromCharCode(b);if(txt.length>600)txt=txt.slice(-300);if(/@linuxlab:[^\n]*[#$] $/.test(txt.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g,''))){ready=true;onReady()}}});
  }catch(e){console.error(e);setStat("error","bad");msg.textContent="Could not start the VM: "+e.message+". Check your connection and reload."}
}
function flush(){raf=0;if(outBuf.length){term.write(new Uint8Array(outBuf));outBuf=[]}}
function onReady(){setStat("running","ok");$("#boot").classList.add("hide");doFit();term.focus();toast("Linux is ready. Try the first lesson.");restoreSaved()}

/* ---------- save / export / import ---------- */
const SAVE_DIRS="root home etc/passwd etc/shadow etc/group etc/gshadow etc/subuid etc/subgid etc/ssh etc/sudoers.d etc/systemd/system etc/fstab etc/hosts var/spool/cron srv opt usr/local data";
function waitFor(re,ms){return new Promise((res,rej)=>{let t="";const h=b=>{t+=String.fromCharCode(b);if(re.test(t)){emulator.remove_listener("serial0-output-byte",h);res(t)}};emulator.add_listener("serial0-output-byte",h);setTimeout(()=>{try{emulator.remove_listener("serial0-output-byte",h)}catch(e){}rej(new Error("timeout"))},ms)})}
async function makeSave(){
  if(!ready)throw new Error("VM not ready");
  const p=waitFor(/LL_SAVE_DONE/,60000);
  send("\x15cd /; mkdir -p /mnt; mountpoint -q /mnt || mount -t 9p host9p /mnt; tar czf /mnt/save.tgz --ignore-failed-read $(for d in "+SAVE_DIRS+"; do [ -e $d ] && echo $d; done) 2>/dev/null; echo LL_SAVE_$(echo DONE)\n");
  await p;await new Promise(r=>setTimeout(r,300));
  return await emulator.read_file("save.tgz");
}
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open("linuxlab",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idb(mode,fn){const db=await idbOpen();return new Promise((res,rej)=>{const tx=db.transaction("kv",mode);const rq=fn(tx.objectStore("kv"));tx.oncomplete=()=>res(rq&&rq.result);tx.onerror=()=>rej(tx.error)})}
$("#btnSave").onclick=async()=>{try{toast("Saving...");const d=await makeSave();await idb("readwrite",s=>s.put(d,"save"));toast("Saved in this browser ("+Math.round(d.length/1024)+" KB)")}catch(e){toast("Save failed: "+e.message)}};
$("#btnExport").onclick=async()=>{try{toast("Packing...");const d=await makeSave();const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([d],{type:"application/gzip"}));a.download="linuxlab-save.tgz";a.click()}catch(e){toast("Export failed: "+e.message)}};
$("#btnImport").onclick=()=>$("#fileImport").click();
$("#fileImport").onchange=async e=>{const f=e.target.files[0];if(!f)return;await applyRestore(new Uint8Array(await f.arrayBuffer()));e.target.value=""};
async function applyRestore(buf){if(!ready){toast("Wait until Linux is ready");return}await emulator.create_file("restore.tgz",buf);send("\x15mkdir -p /mnt; mountpoint -q /mnt || mount -t 9p host9p /mnt; tar xzf /mnt/restore.tgz -C / && echo '[linuxlab] files restored'\n");toast("Restoring files...")}
async function restoreSaved(){try{const d=await idb("readonly",s=>s.get("save"));if(d&&d.byteLength>0){await applyRestore(new Uint8Array(d))}}catch(e){}}
$("#btnReboot").onclick=()=>{if(confirm("Restart the VM? Unsaved changes are lost (use Save first)."))boot()};

/* ---------- lessons UI ---------- */
function persist(){localStorage.setItem(LS,JSON.stringify([...done]))}
function counts(){let n=0,d=0;LESSONS.forEach(l=>l.tasks.forEach((t,i)=>{n++;if(done.has(l.id+":"+i))d++}));$("#pbar").style.width=(n?d/n*100:0)+"%";$("#ptxt").textContent=d+" / "+n+" tasks";LESSONS.forEach(l=>{const c=l.tasks.filter((t,i)=>done.has(l.id+":"+i)).length;const e=$("#cnt-"+l.id);if(e)e.textContent=c+"/"+l.tasks.length})}
function renderLessons(){
  const box=$("#lessonList");box.innerHTML="";
  LESSONS.forEach((l,li)=>{
    const d=document.createElement("details");d.className="lesson";if(li===0)d.open=true;
    d.innerHTML=`<summary><span class="num">${l.icon}</span><span class="lt"><b>${l.title}</b><small>${l.level}</small></span><span class="cnt" id="cnt-${l.id}"></span></summary><div class="story">${l.story}</div>`;
    l.tasks.forEach((t,i)=>{
      const k=l.id+":"+i;const el=document.createElement("div");el.className="task"+(done.has(k)?" done":"");el.id="task-"+l.id+"-"+i;
      el.innerHTML=`<div class="hd"><input type="checkbox" ${done.has(k)?"checked":""} aria-label="done"><div class="tt">${t.t}</div></div><code class="cmd"></code><div class="row"><button data-a="run">Run in terminal</button><button data-a="ins">Type it only</button><button data-a="hint">Why / hint</button></div><div class="hint"></div>`;
      el.querySelector(".cmd").textContent=t.cmd;el.querySelector(".hint").textContent=t.hint;
      el.querySelector("input").onchange=e=>{e.target.checked?done.add(k):done.delete(k);el.classList.toggle("done",e.target.checked);persist();counts()};
      el.querySelector('[data-a=run]').onclick=()=>{go();runLine(t.cmd)};
      el.querySelector('[data-a=ins]').onclick=()=>{go();typeLine(t.cmd);track(t.cmd)};
      el.querySelector('[data-a=hint]').onclick=()=>el.querySelector(".hint").classList.toggle("show");
      d.appendChild(el)});
    box.appendChild(d)});
  counts();
}
function check(line){line=line.trim();if(!line)return;LESSONS.forEach(l=>l.tasks.forEach((t,i)=>{const k=l.id+":"+i;if(!done.has(k)&&t.match&&t.match.test(line)){done.add(k);persist();const el=$("#task-"+l.id+"-"+i);if(el){el.classList.add("done");el.querySelector("input").checked=true}counts();toast("Task done: "+t.t)}}))}
function go(){if(innerWidth<=860)view("term");term.focus()}
function renderRef(q){
  const box=$("#refList");box.innerHTML="";q=(q||"").toLowerCase();
  REFERENCE.forEach(g=>{const items=g.items.filter(it=>!q||(it[0]+" "+it[1]+" "+g.g).toLowerCase().includes(q));if(!items.length)return;
    const h=document.createElement("div");h.className="rg";h.innerHTML=g.g+(g.run?"":' <i class="tag ref">reference</i>');box.appendChild(h);
    items.forEach(it=>{const r=document.createElement("div");r.className="ri"+(g.run?"":" noref");r.innerHTML="<code></code><span></span>";r.firstChild.textContent=it[0];r.lastChild.textContent=it[1];if(g.run)r.onclick=()=>{go();typeLine(it[0]);track(it[0])};box.appendChild(r)})})}
$("#refSearch").oninput=e=>renderRef(e.target.value);
function renderAbout(){$("#tab-about").innerHTML=`<h3>What this is</h3><p>A real Debian 12 (i386) Linux machine with the real kernel, systemd, apt/dpkg, sshd, cron and rsyslog, emulated inside your browser tab with the open-source <b>v86</b> x86 emulator. Nothing is sent to a server: no login, no cost, works offline after the first load.</p>
<h3>Honest limits</h3><ul>
<li><b>Speed:</b> it is an emulated PC. Boot takes about 1-3 minutes on a phone (less on a laptop) and commands run slower than on real hardware. Heavy jobs (compiling, big archives) are slow.</li>
<li><b>No internet inside the VM.</b> ping/curl/dig to the outside will fail. Localhost, loopback, dummy interfaces, ssh to localhost, nginx on localhost all work. apt uses a small built-in offline repository (nginx, jq, tmux, ncdu) - real apt, real dpkg, but not the full Debian archive.</li>
<li><b>Single machine:</b> you cannot ssh between two VMs. Practice SSH against localhost.</li>
<li><b>Hardware features missing:</b> no real disks to partition (use image files and loop devices), no LVM or RAID, no GPU, no Docker (needs more kernel features and RAM), no SELinux.</li>
<li><b>Persistence:</b> the VM resets on reload. <b>Save</b> stores your home, /etc users, ssh, systemd units, cron and /srv in this browser (restored automatically next time). <b>Export / Import</b> moves that bundle as a .tgz file. Installed packages and logs are not saved.</li>
<li><b>Phones:</b> use the key bar above the keyboard for Tab, Ctrl, Esc and arrows. Landscape mode gives more room. Keep the tab in the foreground; browsers pause background tabs.</li>
<li><b>Task ticks</b> are detected from commands you type and can also be ticked by hand. They are stored in this browser only.</li></ul>
<h3>Differences from your office server</h3><ul><li>RedHat-family systems use dnf/rpm, firewalld and SELinux. Those are in the Commands tab as reference only.</li><li>Real servers have real network, disks, monitoring and users. The commands and the thinking are the same.</li></ul>`}

/* ---------- navigation ---------- */
function view(v){document.body.dataset.view=v;$$("#bottom button").forEach(b=>b.classList.toggle("on",b.dataset.view===v));if(v!=="term"){$$("#tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===v));$$(".tab").forEach(t=>t.classList.toggle("on",t.id==="tab-"+v))}else setTimeout(()=>{doFit();term.focus()},60)}
$$("#bottom button").forEach(b=>b.onclick=()=>view(b.dataset.view));
$$("#tabs button").forEach(b=>b.onclick=()=>{$$("#tabs button").forEach(x=>x.classList.toggle("on",x===b));$$(".tab").forEach(t=>t.classList.toggle("on",t.id==="tab-"+b.dataset.tab))});
document.body.dataset.view="term";
/* key bar */
const KEYS={esc:"\x1b",tab:"\t",up:"\x1b[A",down:"\x1b[B",right:"\x1b[C",left:"\x1b[D","c-c":"\x03","c-d":"\x04","c-l":"\x0c"};
$$("#keybar button").forEach(b=>{b.addEventListener("pointerdown",e=>e.preventDefault());b.onclick=()=>{
  if(b.dataset.k==="ctrl"){ctrlArmed=!ctrlArmed;b.classList.toggle("armed",ctrlArmed);return}
  const v=b.dataset.k?KEYS[b.dataset.k]:b.dataset.t;send(v);track(v);term.focus()}});
renderLessons();renderRef("");renderAbout();
if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
boot();
})();
