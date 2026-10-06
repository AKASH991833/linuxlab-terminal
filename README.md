# LinuxLab - a real Linux terminal in your browser

Practice Linux sysadmin interview skills on your phone or laptop. No install, no account, no server.
A real **Debian 12 (i386)** machine boots inside your browser tab using the [v86](https://github.com/copy/v86) x86 emulator (WebAssembly). Everything runs client-side.

## What you get
- A real shell with systemd, apt/dpkg, OpenSSH (server + client), cron, rsyslog/journald, iproute2, nmap, tcpdump-style tools, netcat, socat, mtr, dig, LVM2, mdadm, sysstat, rpm and rpm2cpio, strace, lsof, rsync, tmux, vim, nano and more.
- 15 guided lessons with 130+ tasks and checklists: users and sudo, permissions, processes, systemd, logs, networking, SSH, package management, disks/LVM/RAID, cron, backup, RPM, and a troubleshooting incident.
- A searchable command reference, mobile key bar (Ctrl, Tab, arrows, Esc).
- Save / Export / Import of your files (home, /etc, /srv ...).

## Honest limits
- It is an emulator: first boot takes about 1-3 minutes on a phone (about 115 MB one-time download, then cached). Heavy commands are slow.
- No internet inside the VM. apt installs from a small offline repo (nginx, jq, tmux, ncdu, rpm tools). ping/curl/dig to the outside world fail by design.
- Not Red Hat: `rpm` works for real (build, install, query, verify), but `dnf`/`yum`, `firewalld`, SELinux, `subscription-manager` are shown as reference cards only. Kali pentest suites are not included; nmap, nc, tcpdump-style tools are.
- 32-bit x86 only. No Docker/Kubernetes, no real disks (practice LVM/RAID on loop devices), no real multi-host SSH (ssh to localhost works).
- State resets on reload unless you press Save (stored in your browser's IndexedDB) or Export.

## Run / deploy
Static site. Serve the folder with any web server (GitHub Pages, Netlify, Vercel). The VM image is `assets/vm/root.part*` (squashfs split in parts under 25 MB), joined in the browser.

Built with xterm.js and v86 (BSD-2). See `assets/v86/LICENSE-v86.txt`.
