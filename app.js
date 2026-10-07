"use strict";
(function(){
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const CFG={ parts:4, memory:256, kernel:"bzImage", diskParts:null };
const LS="linuxlab.progress.v1";
let emulator=null, term, fit, typed="", ctrlArmed=false, ready=false, skipRestore=false, outBuf=[], raf=0;
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
    const kernel=await fetchBuf(man.kernel.file+"?v="+man.version,g=>{bar.style.width=Math.min(95,g/man.kernel.size*100)+"%";msg.textContent="Downloading kernel... "+(g/1048576).toFixed(1)+" MB"});
    const bios=await fetchBuf("seabios.bin"),vga=await fetchBuf("vgabios.bin");
    bar.style.width="100%";title.textContent="Booting Debian (this takes a while)";msg.textContent="Loading only the disk blocks Linux needs, not the full image. Real systemd boot. Keep this tab open; slower connections and phones take longer.";
    if(emulator){try{emulator.destroy()}catch(e){}}
    emulator=new V86({wasm_path:"v86.wasm",memory_size:CFG.memory*1024*1024,vga_memory_size:2*1024*1024,bios:{buffer:bios},vga_bios:{buffer:vga},bzimage:{buffer:kernel},hda:{url:man.root.file+"?v="+man.version,async:true,size:man.root.size,fixed_chunk_size:262144},hdb:{url:man.repo.file+"?v="+man.version,async:true,size:man.repo.size,fixed_chunk_size:262144},filesystem:{},
      cmdline:"console=ttyS0 noapic nolapic tsc=reliable mitigations=off random.trust_cpu=on loglevel=3 systemd.show_status=1 systemd.log_level=warning",autostart:true,disable_keyboard:true,disable_mouse:true});
    let txt="";
    emulator.add_listener("serial0-output-byte",b=>{outBuf.push(b);if(!raf)raf=requestAnimationFrame(flush);
      if(!ready){txt+=String.fromCharCode(b);if(txt.length>600)txt=txt.slice(-300);if(/@linuxlab:[^\n]*[#$] $/.test(txt.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g,''))){ready=true;onReady()}}});
  }catch(e){console.error(e);setStat("error","bad");msg.textContent="Could not start the VM: "+e.message+". Check your connection and reload."}
}
function flush(){raf=0;if(outBuf.length){term.write(new Uint8Array(outBuf));outBuf=[]}}
function onReady(){setStat("running","ok");$("#boot").classList.add("hide");doFit();term.focus();toast("Linux is ready. Try the first lesson.");if(!skipRestore)restoreSaved();skipRestore=false;}

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

/* ---------- offline preparation / clean reset ---------- */
$("#btnReset").onclick=async()=>{
  if(!confirm("Reset the lab to a clean machine? Saved files, current VM changes and lesson ticks in THIS browser will be removed. Export anything you want to keep first."))return;
  try{await idb("readwrite",s=>s.delete("save"));done.clear();persist();renderLessons();skipRestore=true;boot()}catch(e){toast("Reset failed: "+e.message)}
};
$("#btnOffline").onclick=async()=>{
  const b=$("#btnOffline");b.disabled=true;
  try{
    if(!("serviceWorker" in navigator))throw new Error("Offline caching is not supported in this browser");
    await navigator.serviceWorker.ready;
    const man=await (await fetch("manifest.json",{cache:"no-cache"})).json();
    const cache=await caches.open("linuxlab-v2");
    const urls=["./","index.html","style.css","xterm.css","xterm.js","addon-fit.js","libv86.js","content.js","app.js","manifest.json","manifest.webmanifest","icon.svg","seabios.bin","vgabios.bin","v86.wasm",man.kernel.file+"?v="+man.version];
    for(let i=0;i<urls.length;i++){
      b.textContent="Offline "+Math.round(i/urls.length*100)+"%";
      const r=await fetch(urls[i]);if(!r.ok)throw new Error(urls[i]+" "+r.status);
      await cache.put(urls[i],r);
    }
    for(const disk of [man.root,man.repo]){
      for(let offset=0;offset<disk.size;offset+=262144){
        const end=offset+262143;
        const r=await fetch(disk.file+"?v="+man.version,{headers:{Range:"bytes="+offset+"-"+end}});
        if(r.status===507)throw new Error("Not enough browser storage. Free space and retry.");if(r.status!==206)throw new Error("Server must support disk ranges");await r.arrayBuffer();
        b.textContent="Offline "+Math.round((offset+262144)/disk.size*100)+"%";
      }
    }
    b.textContent="Offline ready";toast("Full system cached in this browser. Offline use is ready; browsers can still evict storage.");
    if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
  }catch(e){b.textContent="Download offline";toast("Offline download failed: "+e.message)}finally{b.disabled=false}
};

/* ---------- lessons UI ---------- */
function persist(){localStorage.setItem(LS,JSON.stringify([...done]))}
function counts(){let n=0,d=0;LESSONS.forEach(l=>l.tasks.forEach((t,i)=>{n++;if(done.has(l.id+":"+i))d++}));$("#pbar").style.width=(n?d/n*100:0)+"%";$("#ptxt").textContent=d+" / "+n+" tasks";LESSONS.forEach(l=>{const c=l.tasks.filter((t,i)=>done.has(l.id+":"+i)).length;const e=$("#cnt-"+l.id);if(e)e.textContent=c+"/"+l.tasks.length})}
function renderLessons(){
  const box=$("#lessonList");box.innerHTML='<div class="story"><b>First steps</b><br>You are root. Your home is /root. This is a server, so Desktop and Downloads folders are not created automatically. Use pwd to see your location, ls /etc to list a folder, and cat /etc/os-release to read a file. cat /etc fails because /etc is a folder. Try: cd ~; echo hello &gt; notes.txt; cat notes.txt. Linux paths and commands are case-sensitive.</div>';
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
function renderAbout(){$("#tab-about").innerHTML=`<h3>What this is</h3><p>A real Debian 12 (i386) Linux machine with the real kernel, systemd, apt/dpkg, sshd, cron and rsyslog, emulated inside your browser tab with the open-source <b>v86</b> x86 emulator. Nothing is sent to a server: no login, no cost, loads disk blocks on demand; use Download offline to cache the full system.</p>
<h3>Honest limits</h3><ul>
<li><b>Speed:</b> it is an emulated PC. Boot takes about 1-3 minutes on a phone (less on a laptop) and commands run slower than on real hardware. Heavy jobs (compiling, big archives) are slow.</li>
<li><b>No internet inside the VM.</b> ping/curl/dig to the outside will fail. Localhost, loopback, dummy interfaces, ssh to localhost, nginx on localhost all work. apt uses a small built-in offline repository (nginx, jq, tmux, ncdu) - real apt, real dpkg, but not the full Debian archive.</li>
<li><b>Single machine:</b> you cannot ssh between two VMs. Practice SSH against localhost.</li>
<li><b>Hardware features missing:</b> no real disks to partition (use image files and loop devices), LVM and RAID work on loop devices, no GPU, no Docker (needs more kernel features and RAM), no SELinux.</li>
<li><b>Persistence:</b> the VM resets on reload. <b>Save</b> stores your home, /etc users, ssh, systemd units, cron and /srv in this browser (restored automatically next time). <b>Export / Import</b> moves that bundle as a .tgz file. Installed packages and logs are not saved.</li>
<li><b>Offline:</b> Download offline fetches the full system (about 114 MB) and app into this browser. Until it finishes, newly used disk blocks need a connection. Browser storage can be evicted; the button will report download failures. Reset lab clears saved files and lesson ticks, not the offline cache.</li>
<li><b>Phones:</b> use the key bar above the keyboard for Tab, Ctrl, Esc and arrows. Landscape mode gives more room. Keep the tab in the foreground; browsers pause background tabs.</li>
<li><b>Task ticks</b> are detected from commands you type and can also be ticked by hand. They are stored in this browser only.</li></ul>
<h3>Differences from your office server</h3><ul><li>RedHat-family systems use dnf/rpm, firewalld and SELinux. dnf/yum, firewalld and SELinux are reference only. Real rpm/rpmbuild work via the offline package lesson.</li><li>Real servers have real network, disks, monitoring and users. The commands and the thinking are the same.</li></ul>`}

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
