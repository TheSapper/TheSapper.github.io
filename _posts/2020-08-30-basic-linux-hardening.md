---
title: Basic Linux Hardening
category: Guides
---

This guide follows on from the [Initial Linux hardening](https://infosecsapper.com/guides/initial-linux-hardening "Initial Linux Hardening") guide and will cover the basic steps to take to harden Linux after you've completed the initial installation and established secure access.

## Contents
{:.no_toc}

* TOC
{:toc}

## Installed Packages

As this guide is based on the minimal install, it's likely that you won't need to remove or disable any of the installed packages.
Assuming you don't need to remove any packages (or already have removed any you don't need), update the installed packages:

```shell
yum update
```

You should also make sure the system regularly checks for updates. You could automatically install these updates, but I would advise against it so that you can at least review the updates and patch notes before installing. You can do this by using the `yum-cron` package:

```shell
yum install yum-cron
systemctl enable yum-cron.service --now
```

Then open `/etc/yum/yum-cron.conf` and make sure the following values are set to ensure you're notified about updates but they're not automatically downloaded and installed:

```shell
update_messages = yes
download_updates = no
apply_updates = no
```

You can also configure the email settings to send notifications to a remote recipient, which would be wise if you're not going to be logging into this machine regularly. Likewise, you may want to set the hourly cron job to automatically install security updates by using the following settings in `/etc/yum/yum-cron-hourly.conf`:

```shell
update_cmd = security
update_messages = yes
download_updates = yes
apply_updates = yes
```

When you're finished configuring `yum-cron`, restart the service and check the status:

```shell
systemctl restart yum-cron.service
systemctl status yum-cron.service
```

## Time and Logging

### NTP with Chrony

We should configure the machine to keep time properly, to ensure the best accuracy of logs. The package installed in CentOS 7 by default is `chrony`, so we'll use that rather than `ntp`. Check the settings in `/etc/chrony.conf` and amend it to your requirements (for example, if you already have a time server in your environment, you'll want to configure it as a source in `/etc/chrony.conf`).  
To allow NTP through the firewall, use the command:

```shell
firewall-cmd --permanent --zone=internal --add-port=123/udp
```

By default, `chrony` will only accept commands from the localhost; if you need to issue commands from a remote host, add the following lines to `/etc/chrony.conf` (where `aaa.bbb.ccc.ddd/xx` is the CIDR address of the remote host form which commands will be received):

```shell
bindcmdaddress 0.0.0.0
cmdallow aaa.bbb.ccc.ddd/xx
```

For remote control, you will also need to open 323/udp in the firewall:

```shell
firewall-cmd --permanent --zone=internal --add-port=323/udp
```

The [RedHat documentation](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/system_administrators_guide/sect-understanding_chrony_and-its_configuration#sect-Security_with_chronyc "Redhat - Understanding Chrony") has further information on `chrony`, should you wish to learn more.

### Logging with Rsyslog

With the system time accurately set, now would be as good a time as any to make sure logging is enabled. The minimal install we've been using comes with the `rsyslog` package installed, so just make sure the service starts at boot and is running:

```shell
systemctl enable rsyslog.service
systemctl start rsyslog.service
```

We'll look at configuring `rsyslog` in another post; for now we can leave the config with default settings and retrieve logs from our `/var/log` partition.  
We should ensure the correct file permissions are set:

```shell
chown root /var/log            # root owns the directory
chmod 0640 /path/to/audit-file # Owner read/write, group read; maximum
```

## Basic Hardening

Up to this point, while ensuring secure configuration, most of what we've done has been to get the system up and running; from here we'll be looking at configuration more specific to the task of securing the system. First, we'll begin by controlling how users interact with the system, and what they're capable of when they do.  

### Password Quality

First, enforce a secure password policy by editing `/etc/security/pwquality.conf` and amend the values according to your organisation's existing password policy. You should also make corresponding changes to `/etc/login.defs`, otherwise commands that do not leverage PAM tools (such as `useradd`) will not follow your password policy enforcement.  
_There are a couple of schools of thought as far as password policies are concerned. Some believe forcing regular password changes is a good way to deny an attacker the opportunity to crack/brute passwords. I prefer to enforce a longer minimum length of password instead, and force their expiry only if there is indication of a compromise. This means users are more likely to select a pass**phrase**, rather than a pass**word** and, in my experience, users choose much weaker passwords when forced to regularly change them (say, once a month). Whichever approach you use, you can configure the system to enforce your policy here._  
The `pam_quality` module will check user-defined passwords against the rules you've just configured in `/etc/security/pwquality.conf`; in order to actually use the module (i.e. when a user changes their password with the `passwd` command), it should be called in one of the `pam.d` config files. There should already be a line in `/etc/pam.d/system-auth` as follows:

```shell
password    requisite     pam_pwquality.so try_first_pass local_users_only retry=3 authtok_type=
```

The key here is that the `password` stack is making a call to the `pam_pwquality` module.  
*The RHEL documentation has you add a similar line to `/etc/pam.d/passwd`, but this will cause the module to be called twice on setting a new password, which will prompt the user twice - not particularly user-friendly! However, the [RHEL documentation](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/system-level_authentication_guide/pluggable_authentication_modules "Redhat - PAM") is otherwise a good starting point to learn about PAM.*

### Failed Logins

While you're in `/etc/pam.d/system-auth`, add the following line to the `session` stack immediately after the call to `pam_limits.so`:

```shell
session    required    pam_lastlog.so showfailed
```

When users log in, they will now see the date, time and source of the last failed login, and the number of failed login attempts since the last successful login.  
In order to implement account lockout after failed logins, add the following two lines immediately below the `pam_unix.so` call in the `auth` stack of both `/etc/pam.d/system-auth` and `/etc/pam.d/password-auth`:

```shell
auth   [default=die] pam_faillock.so authfail deny=3 unlock_time=600 fail_interval=900
auth   required pam_faillock.so authsucc deny=3 unlock_time=600 fail_interval=900
```

There's quite a bit going on here - it's important `pam_faillock.so` is called first with `authfail` and then the `authsucc` option, so that successful logins reset the failed login counter. The `deny` option sets the acceptable number of failed login attempts, while `unlock_time` sets the amount of time (in seconds) to lock the account, and `fail_interval` sets the duration (in seconds) during which consecutive login failures must be made in order to trigger the lockout condition.

If you force password expiry, you're likely to want to make sure users don't reuse old passwords. In `/etc/pam.d/system-auth`, add `remember=x` where `x` is the number of passwords to remember to the `pam_unix.so` call in the `password` stack. The line should look like this:

```shell
password   sufficient pam_unix.so sha512 shadow nullok try_first_pass use_authtok remember=24
```

Finally, you should also ensure SHA512 algorithms are used to hash passwords by running the command:

```shell
authconfig --passalgo=sha512 --update
```

### Interactive Shells

You may or may not want to use `screen` to allow users to lock their terminals; I'm not going to cover it here because I have no use for it (I have a fairly typical environment; admins use Windows workstations that automatically lock after x minutes, etc). However, what I will do is log idle sessions off (because I have a fairly typical environment, where admins will lock their Windows machine with a PuTTY session still connected). This is largely doubling up with the SSH timeout config we've already done, but this will also clean up any local terminal sessions that may be running (such as from a KVM in the server room, or a VMWare console). Create the file `/etc/profile.d/auto-logout.sh` and add the following line:

```shell
readonly TMOUT=600
```

*Don't forget to use `chmod +x /etc/profile.d/auto-logout.sh` to make the script executable.*  
This will time out any shell session after 10 minutes (600s) of idle time (the same as our SSH config) and set the variable as read only, so the user can't change/remove it.  
For added hardening, consider adding another script in the `/etc/profile.d/` directory to globally set other shell options, such as setting the `HISTFILE` environmental variable as read only to stop users from changing the location of their shell history, or an attacker redirecting it to `/dev/null` to cover their tracks.  
You should also edit both `/etc/profile` and `/etc/bashrc` to find where `umask` is set, and change it from the default `umask 002` and `umask 022` to just `umask 077`. Setting `umask 007` will grant read/write/execute permissions to the file owner only. If you intend to allow users to share files on this system, `umask 007` will cause issues.

### Restricting Root

We already covered permitting/denying `root` login over SSH in an earlier section, but you may want to restrict `root` access further, depending on your requirements. If you've already denied `root` login over SSH, you can also enforce `root` login over a local console only by making sure `/etc/securetty` exists and only contains one line: `tty1`. The file `/etc/securetty` is used by `pam.d` to determine what terminals `root` can use to log in. If `/etc/securetty` does not exist, `root` will be allowed to log in using any method; if the file exists but is blank, `root` will not be able to log in. Adding the line `tty1` will effectively restrict `root` to log in via the local console only.  
You can also disable the shell for `root` by changing the shell value in `/etc/passwd` to `/bin/false` or `/sbin/nologin`. The effect is the same, but the latter is more user-friendly because you can provide feedback in the form of a message in `/etc/nologin.txt`, whereas the `/bin/false` method will simply exit the login attempt.  
NB: Disabling `root` login over SSH will also affect programs that rely on SSH, such as `sftp` and `scp`. Similarly, disabling the shell for `root` will not impact services that don't require a shell, such as FTP and email clients. If you want finer control over `root` access to services, I suggest you use PAM (assuming the services you want to configure are PAM-aware).

### Removable Media

There are two main reasons to control the behaviour of removable media: one is to prevent data exfiltration, the other is to prevent malicious uploads to your network.  
To stop removable media being used to remove data from your network, you can tell force the media to be mounted as read-only using a `udev` rule. I've created the file `/etc/udev/rules.d/ro_removable_media.rules` with the following `udev` rule:

```shell
SUBSYTEM=="block",ATTRS{removable}=="1",RUN{program}="/sbin/blockdev --setro %N"
```

If you have a legitimate need to mount a writeable removable storage device (for example, backing up some config), you can change the last parameter in the line above from `--setro` (read-only) to `--setrw` (read-write); `udev` will detect changes to configuration files and reload accordingly, but you can force a reload if need be by using the command `udevadm control --reload`. You could also target very specific attributes as an exception to your `udev` rule, if you happen to use a particular make and model of removable storage device; use `man udev` for more information.  
Similar rules can be used to block new USB input devices (such as keyboards), which is useful if, say, your server is already connected to a KVM and you know no new input devices should be added.

If you wish to block the mounting of all removable storage devices, you can do so using `modprobe`. Add a file `/etc/modprobe.d/block-usb-storage.conf` containing the line:

```shell
install usb-storage /bin/false
```

### Securing Cron

A poorly managed `crontab` is a great way to pivot or maintain persistence on a system, so you'll want to make sure only authorised users have access to `cron`. There are a couple of options here: if `/etc/cron.allow` exists, it will act as an explicit whitelist of accounts that can use `cron`, while accounts not present in the file will be implicitly blacklisted; if only `/etc/cron.deny` exists, you'll have an explicit blacklist with an implicit whitelist. If both files exist, `/etc/cron.deny` is ignored. The choice is yours! Blacklist or whitelist, pick whichever suits you and your environment, but I would suggest an explicit whitelist (always) because a user will soon tell you if you've forgotten to whitelist them, but might not be so quick to mention that you've forgotten to blacklist them from something...never forget the principle of least privilege! The allow/deny files are a simple list of system account names, one per line; regardless of the file contents, `root` can always use `cron`.  
Whichever option you pick, just remember to make sure that `root` owns the file and you use `chmod 600` to prevent unauthorised edits! Repeat this process for `/etc/at.allow` and/or `/etc/at.deny` (`at` is like `cron`, but runs tasks at a specific time, as opposed to on a regular schedule).

### Disable Core Dumps

When a program terminates unexpectedly, the kernel will create a core dump, which is a file containing the address space (memory) of the file at the time of crash. They are useful debugging tools, but are of little use on a stable production system and present the added risk of potentially sensitive data being leaked. We're better of just disabling the feature.  
To disable core dumps for all users, first edit `/etc/security/limits.conf` and add the line:

```shell
* hard core 0
```

This sets a hard limit of size `0` for all users, so they cannot increase the limit in their own sessions.  
You can also do this using `/etc/profile`, or a custom script in the directory `/etc/profile.d/`, if you prefer. Append the line:

```shell
echo 'ulimit -S -c 0 > /dev/null 2>&1'
```

This will set a soft limit of 0 for every user when they log in. Omit the `-S` option to set both a hard and soft limit of `0`.  
Lastly, you can use `systemd` to prevent the creation of core dumps by editing `/etc/systemd/coredumps.conf` and setting the following values:

```shell
Storage=none
ProcessSizeMax=0
```

To stop setuid programs creating core dumps, and a configuration file under `/etc/sysctl.d/`, as we have previously, and set the value `fs.suid_dumpable=0` and reload the `sysctl` config with the command `sysctl -p`.  

### Kernel Hardening with Modprobe

We'll use `modprobe` to disable uncommon protocols and filesystems, to exercise more control over how the operating system functions and prevent users (maliciously or otherwise) from doing unexpected things. We could use `modprobe` to blacklist certain kernel modules, but this will only serve to stop them being loaded at boot; they could still be loaded manually or as a dependency of an allowed module. Instead, we'll redirect their install command to `/bin/true`.  
*NB: we're redirecting to `/bin/true` as opposed to `/bin/false` to avoid any potential problems caused by the loading of the module returning a 'false' result. It doesn't appear as intuitive if you look at the config, as `/bin/false` clearly shows a deliberate attempt to make sure something doesn't happen, but let's assume that if you're tuning kernel modules, you know that `/bin/true` would have the same effect.*  
All modules that can be possible loaded are listed in `/lib/modules`. To list them all, use the command:

```shell
find /lib/modules/$(uname -r) -type f -name '*.ko*'
```

You can `grep` the results to find particular modules. The following modules are present that should be blocked from loading:

```shell
echo "install cramfs /bin/true" > /etc/modprobe.d/cramfs.conf
echo "install squashfs /bin/true" > /etc/modprobe.d/squashfs.conf
echo "install udf /bin/true" > /etc/modprobe.d/udf.conf
echo "install dccp /bin/true" > /etc/modprobe.d/dccp.conf
echo "install sctp /bin/true" > /etc/modprobe.d/sctp.conf
```

There may be more depending on your use case and requirements, but these are a good place to start in general.

At this stage, you have a relatively secure Linux installation and can begin using it in a production environment, assuming you have no further specific requirements, such as any imposed by regulatory frameworks. However, you could also proceed with further security configuration explained in the next part of the guide: [Intermediate Linux Hardening](htpts://infosecsapper.com/guides/intermediate-linux-hardening "Intermediate Linux Hardening").
