/* Local learning features. Checks run against the real guest, never a command-name match. */
function initPractice(lab){
const box=document.querySelector('#tab-practice'),key='linuxlab.practice.v1';
let state;try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){state={}}
state.passed=state.passed||{};state.days=state.days||[];
let active=null,busy=false,mode='interview',session=0;
const save=()=>localStorage.setItem(key,JSON.stringify(state));
const base='/opt/linuxlab-drills';
const interviews=[
{id:'file',title:'A handover note',question:'Create /opt/linuxlab-drills/handover.txt containing the exact line: ready for handover',setup:`mkdir -p ${base}; rm -f ${base}/handover.txt`,check:`grep -qx 'ready for handover' ${base}/handover.txt`,hint:`echo 'ready for handover' > ${base}/handover.txt`,why:'Redirection creates a file. grep -x checks the entire line.'},
{id:'dir',title:'Private backups',question:'Create /opt/linuxlab-drills/backups, owned by root, with permissions 700.',setup:`mkdir -p ${base}; rm -rf ${base}/backups`,check:`test "$(stat -c '%a:%U' ${base}/backups 2>/dev/null)" = '700:root'`,hint:`mkdir -p ${base}/backups; chown root:root ${base}/backups; chmod 700 ${base}/backups`,why:'700 allows only the owner to list, create and enter.'},
{id:'user',title:'Onboard a colleague',question:'Create ll_candidate with a home folder and /bin/bash as the login shell. Do not use an existing real user.',setup:'if id ll_candidate >/dev/null 2>&1; then userdel -r ll_candidate; fi',check:`getent passwd ll_candidate | awk -F: '$6=="/home/ll_candidate" && $7=="/bin/bash" {ok=1} END{exit !ok}' && test -d /home/ll_candidate && id ll_candidate >/dev/null && test "$(getent passwd ll_candidate | cut -d: -f7)" = /bin/bash`,hint:'useradd -m -s /bin/bash ll_candidate',why:'useradd is the lower-level tool. -m creates home, -s selects the shell.'},
{id:'group',title:'Team access',question:'Create group ll_ops and add ll_candidate as a supplementary member, keeping their other groups.',setup:'id ll_candidate >/dev/null 2>&1 || useradd -m -s /bin/bash ll_candidate; groupadd -f ll_ops; gpasswd -d ll_candidate ll_ops >/dev/null 2>&1 || true',check:`id -nG ll_candidate | tr ' ' '\n' | grep -qx ll_ops`,hint:'usermod -aG ll_ops ll_candidate',why:'-aG appends groups. -G alone can remove other supplementary memberships.'},
{id:'link',title:'Stable config path',question:'Make /opt/linuxlab-drills/current a symbolic link to /opt/linuxlab-drills/releases/v1.',setup:`mkdir -p ${base}/releases/v1; rm -f ${base}/current`,check:`test -L ${base}/current && test "$(readlink -f ${base}/current)" = ${base}/releases/v1`,hint:`ln -s ${base}/releases/v1 ${base}/current`,why:'A symbolic link points to a path and can cross filesystems.'},
{id:'logs',title:'Count failed requests',question:'In /opt/linuxlab-drills/access.log, count lines containing status 500. Write only the number to failed-count.txt in the same folder.',setup:`mkdir -p ${base}; printf '200 /\n500 /orders\n200 /health\n500 /pay\n500 /orders\n' > ${base}/access.log; rm -f ${base}/failed-count.txt`,check:`test "$(cat ${base}/failed-count.txt 2>/dev/null)" = 3`,hint:`grep -c '^500 ' ${base}/access.log > ${base}/failed-count.txt`,why:'grep -c counts matching lines, not total occurrences.'},
{id:'archive',title:'Verified backup',question:'Archive the config folder as config.tgz in /opt/linuxlab-drills. It must contain config/app.conf with the original content.',setup:`mkdir -p ${base}/config; echo workers=4 > ${base}/config/app.conf; rm -f ${base}/config.tgz`,check:`test "$(tar xOf ${base}/config.tgz config/app.conf 2>/dev/null)" = workers=4`,hint:`tar czf ${base}/config.tgz -C ${base} config`,why:'-C sets the working directory. Relative names make a portable archive.'},
{id:'checksum',title:'Detect file corruption',question:'Create a sha256sum checksum file named data.sha256 for data.txt in /opt/linuxlab-drills, usable by sha256sum -c.',setup:`mkdir -p ${base}; echo 'release payload' > ${base}/data.txt; rm -f ${base}/data.sha256`,check:`test -s ${base}/data.sha256 && sha256sum -c ${base}/data.sha256 >/dev/null 2>&1 && grep -q data.txt ${base}/data.sha256`,hint:`sha256sum ${base}/data.txt > ${base}/data.sha256`,why:'Checksums detect changes; they do not encrypt data.'},
{id:'process',title:'Stop a runaway job',question:'A background sleep job started by this drill is recorded in runaway.pid. Stop that exact process, not unrelated processes.',setup:`mkdir -p ${base}; if test -s ${base}/runaway.pid; then p=$(cat ${base}/runaway.pid); if test "$(cat /proc/$p/comm 2>/dev/null)" = sleep && tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -qx 'sleep 900 '; then kill $p 2>/dev/null || true; fi; fi; sleep 900 </dev/null >/dev/null 2>&1 & echo $! > ${base}/runaway.pid`,check:`test -s ${base}/runaway.pid && ! kill -0 $(cat ${base}/runaway.pid) 2>/dev/null`,hint:`kill $(cat ${base}/runaway.pid)`,why:'Use the PID to target one process. SIGTERM permits cleanup.'},
{id:'route',title:'Diagnose localhost',question:'Write the IPv4 loopback interface name (lo) to loopback.txt in /opt/linuxlab-drills after inspecting ip addr.',setup:`mkdir -p ${base}; rm -f ${base}/loopback.txt`,check:`test "$(cat ${base}/loopback.txt 2>/dev/null)" = lo && ip -4 addr show lo | grep -q 127.0.0.1`,hint:`ip -4 addr show; echo lo > ${base}/loopback.txt`,why:'Loopback is local to this machine, not a path to the internet.'},
{id:'cron',title:'Schedule a health check',question:'Create /etc/cron.d/ll-health: every five minutes, root runs /bin/true. Use mode 644 and a trailing newline.',setup:'rm -f /etc/cron.d/ll-health',check:`test "$(stat -c %a /etc/cron.d/ll-health 2>/dev/null)" = 644 && grep -Fxq '*/5 * * * * root /bin/true' /etc/cron.d/ll-health && test "$(tail -c 1 /etc/cron.d/ll-health | od -An -tu1 | tr -d ' ')" = 10`,hint:`printf '*/5 * * * * root /bin/true\n' > /etc/cron.d/ll-health; chmod 644 /etc/cron.d/ll-health`,why:'Files in /etc/cron.d include a user field; user crontabs do not.'},
{id:'service',title:'Build a managed service',question:'Create ll-interview.service running /bin/sleep infinity. Reload systemd and start it. It must be active with that ExecStart.',setup:'systemctl stop ll-interview.service 2>/dev/null || true; rm -f /etc/systemd/system/ll-interview.service; systemctl daemon-reload',check:`systemctl is-active --quiet ll-interview.service && systemctl show ll-interview.service -p ExecStart | grep -q '/bin/sleep.*infinity'`,hint:`printf '[Unit]\nDescription=Interview lab\n[Service]\nExecStart=/bin/sleep infinity\n' > /etc/systemd/system/ll-interview.service; systemctl daemon-reload; systemctl start ll-interview`,why:'daemon-reload reads unit changes. start runs it now; enable controls boot.'}
];
const incidents=[
{id:'svc',title:'Orders service down',question:'ll-orders.service fails with an EXEC error. Inspect systemctl status and journalctl, repair the missing executable, and get it active. The program should write OK to /opt/linuxlab-drills/orders-health and keep running.',setup:`mkdir -p ${base}; systemctl stop ll-orders 2>/dev/null || true; rm -f ${base}/orders-worker ${base}/orders-health; printf '[Unit]\nDescription=Orders drill\n[Service]\nExecStart=${base}/orders-worker\nRestart=on-failure\nRestartSec=3\n' > /etc/systemd/system/ll-orders.service; systemctl daemon-reload; systemctl start ll-orders || true`,check:`systemctl is-active --quiet ll-orders && test "$(cat ${base}/orders-health 2>/dev/null)" = OK`,hint:`journalctl -u ll-orders --no-pager -n 10; printf '#!/bin/sh\necho OK > ${base}/orders-health\nexec /bin/sleep infinity\n' > ${base}/orders-worker; chmod +x ${base}/orders-worker; systemctl reset-failed ll-orders; systemctl restart ll-orders`,why:'203/EXEC often means a missing executable, a permission issue or a bad interpreter.'},
{id:'permission',title:'App cannot read config',question:'ll_reader cannot read app-secret.conf. Grant that user read access with an ACL while keeping mode 640 and root ownership. Do not make it world-readable.',setup:`mkdir -p ${base}; id ll_reader >/dev/null 2>&1 || useradd -M -s /bin/bash ll_reader; echo token=demo > ${base}/app-secret.conf; setfacl -b ${base}/app-secret.conf; chown root:root ${base}/app-secret.conf; chmod 640 ${base}/app-secret.conf`,check:`test "$(stat -c '%a:%U' ${base}/app-secret.conf)" = 640:root && su -s /bin/sh ll_reader -c 'test -r ${base}/app-secret.conf' && getfacl -cp ${base}/app-secret.conf | grep -q '^user:ll_reader:r--'`,hint:`namei -l ${base}/app-secret.conf; getfacl ${base}/app-secret.conf; setfacl -m u:ll_reader:r ${base}/app-secret.conf`,why:'An ACL grants one user access without opening the file to everyone.'},
{id:'disk',title:'Application volume full',question:'A dedicated 8 MB tmpfs at /opt/linuxlab-drills/full has filled with app.log. Recover at least 4 MB free space without unmounting the volume or deleting the log file. Do not touch other disks.',setup:`mkdir -p ${base}/full; mountpoint -q ${base}/full && umount ${base}/full; mount -t tmpfs -o size=8m tmpfs ${base}/full; dd if=/dev/zero of=${base}/full/app.log bs=1M count=8 2>/dev/null`,check:`mountpoint -q ${base}/full && test -f ${base}/full/app.log && test "$(df -k --output=avail ${base}/full | tail -1 | tr -d ' ')" -ge 4096`,hint:`df -h ${base}/full; du -h ${base}/full/*; truncate -s 0 ${base}/full/app.log`,why:'Truncating keeps the file and permissions while reclaiming blocks. This drill is a bounded 8 MB volume.'},
{id:'execute',title:'Deploy script fails',question:'The deployment script exists but cannot execute. Repair permissions without making it world-writable, then run it to create a deployed marker.',setup:`mkdir -p ${base}; printf '#!/bin/sh\necho deployed > ${base}/deploy-state\n' > ${base}/deploy.sh; chmod 644 ${base}/deploy.sh; rm -f ${base}/deploy-state`,check:`test -x ${base}/deploy.sh && test "$(stat -c %a ${base}/deploy.sh)" = 755 && test "$(cat ${base}/deploy-state 2>/dev/null)" = deployed`,hint:`ls -l ${base}/deploy.sh; chmod 755 ${base}/deploy.sh; ${base}/deploy.sh`,why:'A shebang chooses the interpreter. Execute permission is required to run the path directly.'},
{id:'brokenlink',title:'Release link is stale',question:'The current-release link points at a missing v0 release. Repair it to releases/v2 without removing that release. Its version.txt must read v2.',setup:`mkdir -p ${base}/releases/v2; echo v2 > ${base}/releases/v2/version.txt; rm -f ${base}/current-release; ln -s ${base}/releases/v0 ${base}/current-release`,check:`test -L ${base}/current-release && test "$(readlink -f ${base}/current-release)" = ${base}/releases/v2 && test "$(cat ${base}/current-release/version.txt)" = v2`,hint:`ls -l ${base}/current-release; ln -sfn ${base}/releases/v2 ${base}/current-release`,why:'-n avoids following a directory link, -f replaces the link.'}
];
window.PRACTICE_DATA={interviews,incidents};
const day=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-')};
const serial=d=>Math.floor(Date.parse(d+'T00:00:00Z')/86400000);
const daily=()=>interviews[((serial(day())%interviews.length)+interviews.length)%interviews.length];
function streak(){let n=0,x=serial(day());const days=new Set(state.days.map(serial));if(!days.has(x))x--;while(days.has(x)){n++;x--}return n}
async function command(script){
 if(!lab.isReady())throw new Error('Wait until Linux is ready');
 const tag='LLP'+Math.random().toString(36).slice(2,10),pattern=new RegExp('(?:^|[\\r\\n])'+tag+':(PASS|FAIL)[\\r\\n]');
 const p=lab.waitFor(pattern,60000);
 lab.send('\x15( '+script+' ) >/dev/null 2>&1; r=$?; if [ "$r" = 0 ]; then printf "\\n%s:PASS\\n" "'+tag.slice(0,3)+'""'+tag.slice(3)+'"; else printf "\\n%s:FAIL\\n" "'+tag.slice(0,3)+'""'+tag.slice(3)+'"; fi\n');
 let text;try{text=await p}catch(e){throw new Error('Check timed out. Press Ctrl-C in Terminal, wait for the shell prompt, then restart this drill.')} return pattern.exec(text)[1]==='PASS';
}
function node(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e}
function btn(text,fn){const b=node('button',text);b.onclick=fn;return b}
function render(){
 box.replaceChildren();const nav=node('div',null,'practice-nav');for(const [id,label]of [['interview','Interview'],['incidents','Incidents'],['daily','Daily'],['card','Progress card']]){const b=btn(label,()=>{mode=id;render()});b.classList.toggle('on',mode===id);nav.append(b)}box.append(nav);
 if(mode==='card'){renderCard();return}
 box.append(node('p',mode==='daily'?`Daily challenge · ${day()} (India time) · streak ${streak()} day(s). A 12-question rotation, one dated completion each day. Clock changes are not verified.`:'Solve in the real Linux VM. Check answer reads the actual system state. Lesson ticks are separate.')); 
 const list=mode==='incidents'?incidents:mode==='daily'?[daily()]:interviews;
 for(const d of list){const k=(mode==='incidents'?'incident:':'interview:')+d.id,c=node('div',null,'task');c.append(node('b',d.title+(state.passed[k]?' · passed':'')),node('p',d.question));
 c.append(btn('Start / restart drill',async()=>{if(busy)return;busy=true;renderStatus('Setting up a real lab...');const thisSession=++session,startedDaily=mode==='daily',startedDate=day();try{const ok=await command(d.setup);if(!ok)throw new Error('Setup failed. Check free space and permissions.');if(thisSession!==session)return;active={d,k,daily:startedDaily,date:startedDate,session:thisSession};renderStatus('Ready. Solve in Terminal, then return here to Check answer.');lab.go()}catch(e){renderStatus(e.message)}finally{busy=false}}));
 c.append(btn('Check answer',async()=>{if(busy)return;if(!active||active.d.id!==d.id||active.k!==k){renderStatus('Start this drill first.');return}busy=true;const a=active;renderStatus('Checking the actual Linux state...');try{const ok=await command(d.check);if(a.session!==session)return;if(ok){state.passed[k]=true;if(a.daily&&a.date===day()&&!state.days.includes(a.date))state.days.push(a.date);save();render();renderStatus('Passed. The real system meets this drill\'s checks.')}else renderStatus('Not yet. Inspect the system and try again.')}catch(e){renderStatus(e.message)}finally{busy=false}}));
 const h=node('details');h.append(node('summary','Hint / explanation'),node('code',d.hint,'cmd'),node('p',d.why));c.append(h);box.append(c)}
 box.append(node('p','Drills use /opt/linuxlab-drills, ll_* users/units, and /etc/cron.d/ll-health. Start may replace those lab resources. Do not use these reserved names for your own work. Drill state resets with the VM; passed results stay in this browser. Use Reset lab to clear local results.', 'muted'));
 box.append(node('p','To see your last command result, use echo $? in Terminal. Checks run shell commands and can take time in this emulator. Do not run a check while an editor, password prompt or long-running command owns the terminal.', 'muted'));
}
function renderStatus(t){let e=box.querySelector('.practice-status');if(!e){e=node('p',null,'practice-status');box.prepend(e)}e.textContent=t}
let cardName='';
function renderCard(){const p=lab.progress(),passed=Object.keys(state.passed).filter(k=>state.passed[k]).length;box.append(node('h3','Your practice record'),node('p',`Lessons: ${p.done}/${p.total} · checked drills: ${passed}/${interviews.length+incidents.length} · daily streak: ${streak()}`),node('p','This is a self-reported completion card, not an accredited certificate or proof of job readiness. Lesson ticks can be marked by hand. Drill checks validate only the stated conditions.'));
 const input=node('input');input.placeholder='Name for the card';input.value=cardName;input.maxLength=48;input.oninput=()=>cardName=input.value;box.append(input);
 const canvas=node('canvas');canvas.width=1200;canvas.height=675;canvas.className='completion-card';box.append(canvas);draw(canvas,cardName||'Linux learner',p,passed);
 input.addEventListener('input',()=>draw(canvas,cardName||'Linux learner',p,passed));
 const b=btn('Download completion card (PNG)',()=>{if(p.done<p.total){lab.toast('Complete all lesson ticks to unlock the card');return}canvas.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='linuxlab-completion.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)},'image/png')});b.disabled=p.done<p.total;box.append(b,node('p',p.done<p.total?'Unlocks when all 133 lesson tasks are ticked. You can preview it now.':'Unlocked. Download and share it yourself; nothing is posted automatically.'));
}
function draw(c,name,p,passed){const x=c.getContext('2d');x.fillStyle='#040b12';x.fillRect(0,0,1200,675);x.strokeStyle='#19f0c8';x.lineWidth=3;x.strokeRect(28,28,1144,619);x.fillStyle='#19f0c8';x.font='bold 28px monospace';x.fillText('LINUXLAB / PRACTICE RECORD',64,94);x.fillStyle='#cfe8ee';x.font='bold 52px sans-serif';while(x.measureText(name).width>1060&&parseInt(x.font.match(/\d+/)[0])>24)x.font='bold '+(parseInt(x.font.match(/\d+/)[0])-2)+'px sans-serif';x.fillText(name,64,210);x.font='30px sans-serif';x.fillText(p.done===p.total?'Completed the LinuxLab lesson checklist':'Practice in progress',64,284);x.font='24px monospace';x.fillText(`${p.done}/${p.total} lesson tasks · ${passed}/17 checked drills`,64,360);x.fillText(`Daily streak: ${streak()} day(s) · ${day()}`,64,407);x.fillStyle='#8aa4b4';x.font='21px sans-serif';x.fillText('Real Debian Linux practice: users, services, logs, networking, disks.',64,483);x.fillText('Self-reported checklist. Not accredited or independently verified.',64,526);x.font='19px monospace';x.fillText('akash991833.github.io/linuxlab-terminal',64,601)}
lab.onReset=()=>{session++;active=null;state={passed:{},days:[]};save();render()};render();
}

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
  ready=false;setStat("booting","");$("#boot").classList.remove("hide");term.reset();outBuf=[];
  term.writeln("\x1b[36m[LinuxLab loader]\x1b[0m Preparing browser VM assets...");
  const bar=$("#bootbar"),msg=$("#bootmsg"),title=$("#bootTitle");
  title.textContent="Preparing Linux boot";msg.textContent="Preparing browser assets. Live Linux console appears as soon as the kernel starts.";
  try{
    const man=await (await fetch("manifest.json",{cache:"no-cache"})).json();
    const kernel=await fetchBuf(man.kernel.file+"?v="+man.version,g=>{bar.style.width=Math.min(95,g/man.kernel.size*100)+"%";msg.textContent="Downloading kernel... "+(g/1048576).toFixed(1)+" MB"});
    term.writeln("[LinuxLab loader] Kernel loaded: "+kernel.byteLength+" bytes. Loading firmware...");
    const bios=await fetchBuf("seabios.bin"),vga=await fetchBuf("vgabios.bin");
    bar.style.width="100%";title.textContent="Booting Debian (this takes a while)";msg.textContent="Loading only the disk blocks Linux needs, not the full image. Real systemd boot. Keep this tab open; slower connections and phones take longer.";
    if(emulator){try{emulator.destroy()}catch(e){}}
    emulator=new V86({wasm_path:"v86.wasm",memory_size:CFG.memory*1024*1024,vga_memory_size:2*1024*1024,bios:{buffer:bios},vga_bios:{buffer:vga},bzimage:{buffer:kernel},hda:{url:man.root.file+"?v="+man.version,async:true,size:man.root.size,fixed_chunk_size:262144},hdb:{url:man.repo.file+"?v="+man.version,async:true,size:man.repo.size,fixed_chunk_size:262144},filesystem:{},
      cmdline:"console=ttyS0 noapic nolapic tsc=reliable mitigations=off random.trust_cpu=on loglevel=6 systemd.show_status=1 systemd.log_level=warning",autostart:true,disable_keyboard:true,disable_mouse:true});
    term.writeln("[LinuxLab loader] Firmware loaded. Starting the real Linux kernel...");
    term.writeln("[LinuxLab loader] Disk blocks load on demand. Output below is the live guest console.\r\n");
    $("#boot").classList.add("hide");doFit();
    let txt="";
    emulator.add_listener("serial0-output-byte",b=>{outBuf.push(b);if(!raf)raf=requestAnimationFrame(flush);
      if(!ready){txt+=String.fromCharCode(b);if(txt.length>600)txt=txt.slice(-300);if(/@linuxlab:[^\n]*[#$] $/.test(txt.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g,''))){ready=true;onReady()}}});
  }catch(e){console.error(e);setStat("error","bad");term.writeln("\r\n[LinuxLab loader] Boot error: "+e.message);$("#boot").classList.remove("hide");msg.textContent="Could not start the VM: "+e.message+". Check your connection and reload."}
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
  try{await idb("readwrite",s=>s.delete("save"));done.clear();persist();renderLessons();window.LinuxLab.onReset();skipRestore=true;boot()}catch(e){toast("Reset failed: "+e.message)}
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
  if(q){LESSONS.forEach(l=>l.tasks.filter(t=>(t.cmd+" "+t.t+" "+t.hint).toLowerCase().includes(q)).forEach(t=>{const r=document.createElement("div");r.className="task";const title=document.createElement("b");title.textContent=t.t;const c=document.createElement("code");c.className="cmd";c.textContent=t.cmd;const h=document.createElement("p");h.textContent=t.hint;const b=document.createElement("button");b.textContent="Type example";b.onclick=()=>{go();typeLine(t.cmd);track(t.cmd)};r.append(title,c,h,b);box.appendChild(r)}))}
  REFERENCE.forEach(g=>{const items=g.items.filter(it=>!q||(it[0]+" "+it[1]+" "+g.g).toLowerCase().includes(q));if(!items.length)return;
    const h=document.createElement("div");h.className="rg";h.innerHTML=g.g+(g.run?"":' <i class="tag ref">reference</i>');box.appendChild(h);
    items.forEach(it=>{const r=document.createElement("div");r.className="ri"+(g.run?"":" noref");r.innerHTML="<code></code><span></span>";r.firstChild.textContent=it[0];r.lastChild.textContent=it[1];if(g.run)r.onclick=()=>{go();typeLine(it[0]);track(it[0])};box.appendChild(r)})});if(q&&!box.children.length){box.textContent="No saved example for this command. In Terminal, try man <command>, <command> --help, or help <shell builtin>. This cheat sheet covers the lesson commands and curated references, not every Linux command."}}
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
window.LinuxLab={isReady:()=>ready,send,go,toast,waitFor,progress:()=>({done:LESSONS.reduce((n,l,li)=>n+l.tasks.filter((t,ti)=>done.has(l.id+":"+ti)).length,0),total:LESSONS.reduce((n,l)=>n+l.tasks.length,0)}),onReset:()=>{}};
if(document.querySelector("#tab-practice"))initPractice(window.LinuxLab);
if("serviceWorker"in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
boot();
})();
