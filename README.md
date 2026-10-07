# LinuxLab - a real Linux terminal in your browser

Practice Linux sysadmin interview skills on your phone or laptop. No install, no account, no server.
A real **Debian 12 (i386)** machine boots inside your browser tab using the [v86](https://github.com/copy/v86) x86 emulator (WebAssembly). Everything runs client-side.

## What you get
- A real shell with systemd, apt/dpkg, OpenSSH (server + client), cron, rsyslog/journald, iproute2, nmap, tcpdump-style tools, netcat, socat, mtr, dig, LVM2, mdadm, sysstat, rpm and rpm2cpio, strace, lsof, rsync, tmux, vim, nano and more.
- 15 guided lessons with 130+ tasks and checklists: users and sudo, permissions, processes, systemd, logs, networking, SSH, package management, disks/LVM/RAID, cron, backup, RPM, and a troubleshooting incident.
- A searchable command reference, mobile key bar (Ctrl, Tab, arrows, Esc).
- Save / Export / Import of your files (home, /etc, /srv ...).
- Download offline to cache the full system. Reset lab clears this browser's saved files and lesson ticks, then boots a clean VM. Export first to keep your work.
- Lazy disk loading reduces initial download; new commands may pause to fetch additional blocks. Full offline use needs Download offline to finish; browsers can evict cached storage.

## Honest limits
- It is an emulator: first boot takes about 1-3 minutes on a phone (disk blocks load on demand (about 36 MB read during a fast desktop boot test). Download offline caches the complete system, about 114 MB total). Heavy commands are slow.
- No internet inside the VM. apt installs from a small offline repo (nginx, jq, tmux, ncdu, rpm tools). ping/curl/dig to the outside world fail by design.
- Not Red Hat: `rpm` works for real (build, install, query, verify), but `dnf`/`yum`, `firewalld`, SELinux, `subscription-manager` are shown as reference cards only. Kali pentest suites are not included; nmap, nc, tcpdump-style tools are.
- 32-bit x86 only. No Docker/Kubernetes, no real disks (practice LVM/RAID on loop devices), no real multi-host SSH (ssh to localhost works).
- State resets on reload unless you press Save (stored in your browser's IndexedDB) or Export.

## Run / deploy
Static site. Serve the folder with any web server (GitHub Pages, Netlify, Vercel). The root image is `root.sqsh` (about 90 MB) and the offline package repository is `repo.sqsh` (about 21 MB). v86 reads 256 KB ranges on demand. Your server must support HTTP Range requests. GitHub Pages is free, without a card.

Built with xterm.js and v86 (BSD-2). See `LICENSE-v86.txt`.
