---
permalink: /guides/:title
---

This tutorial will guide you through the process of building a hardened Linux image. You may be looking to introduce Linux servers into your environment, have existing servers that are in need of hardening, or you might simply be looking to learn more about Linux - in any of these cases I aim to show you the steps required to establish a more secure baseline for a Linux server build. Like any guide, it should not be treated as a definitive or exhaustive set of step-by-step instructions, and you should make efforts to seek out more information on the points that seem more relevant or interesting (or both!) to you and your goals.

The distro used in this guide is CentOS 7 but the principles and methods used can be translated to whatever distro you prefer using. There is a wide range of Linux distros to chose from, and the differences between them vary greatly, but if you know your chosen distro well, you should be able to translate the various elements in this guide to your preferred OS.

I selected CentOS 7 for this guide because good guides already exist at [highon.coffee](https://highon.coffee/blog/security-harden-centos-7/ "@Arr0way's CentOS 7 hardening guide") and [centos.org](https://wiki.centos.org/HowTos/OS_Protection "CentOS.org's hardening guide") that I used as a basis to create a hardened image. So far, I've used that image to create a logging server, a HIDS server and a web server. In the future I may be using it to create a Splunk Indexer, and it's likely that I'll soon add these as part of an Active Directory domain - I'll definitely documenti that process, so watch this space.

## Contents
- [Download](#download)
- [Initial Build](#initial-build)
  - [Partitioning](#partitioning)
  - [Securing Mount Options](#securing-mount-options)
- [SSH Hardening](#ssh-hardening)
- [Networking](#networking)
  - [Firewall](#firewall)
  - [Protocol Configuration](#protocol-configuration)
  - [TCP Wrappers](#tcp-wrappers)
  - [Connecting](#connecting)
- [Installed Packages](#installed-packages)
- [Time and Logging](#time-and-logging)
  - [NTP with Chrony](#ntp-with-chrony)
  - [Logging with Rsyslog](#logging-with-rsyslog)
- [Basic Hardening](#basic-hardening)
  - [Password Quality](#password-quality)
  - [Failed Logins](#failed-logins)
  - [Interactive Shells](#interactive-shells)
  - [Restricting Root](#restricting-root)
  - [Removable Media](#removable-media)
  - [Securing Cron](#securing-cron)
  - [Disable Core Dumps](#disable-core-dumps)
  - [Kernel Hardening with Modprobe](#kernel-hardening-with-modprobe)
- [Advanced Hardening](#advanced-hardening)
  - [Securing GRUB2 and Boot](#securing-grub2-and-boot)
  - [AIDE](#aide)
  - [Auditd](#auditd)
  - [Buffer Overflow Protection](#buffer-overflow-protection)
  - [SELinux](#selinux)
- [Conclusion](#conclusion)


## Download
An important practice in IT security is to reduce your exposure (your attack surface) by removing surplus software packages, disabling unnecessary services, and so forth; the idea is that with less applications installed and services running, there are less things in your system that could present a vulnerability. Thankfully, the CentOS Project has done a lot of this hard work for us and made a minimal image available, which will install only the minimum packages required for a functional system.  
For the purpose of this guide I'll be installing from an ISO to a virtual machine in VMWare Workstation configured with a single dual-core socket, 2GB RAM and 50GB HDD.

Go to <http://isoredirect.centos.org/centos/7/isos/x86_64/> and select a mirror from which to download the ISO. At the time of writing the image I selected was `CentOS-7-x86_64-Minimal-1804.iso`. Depending on what release is current at the time you're reading this, you may see a different number after `-Minimal-` but the rest of the file name should be the same. You'll also note that there are checksums available in the download directory of your chosen mirror; you can (and should) check these against those listed at <http://mirror.centos.org/centos/7/isos/x86_64/sha256sum.txt.asc>. To validate the checksum in Windows, you can use `certutil.exe` in `cmd`:  
```Batchfile
certutil -hashfile Z:\Path\to\ISO.iso SHA256
```  
or Get-FileHash in PowerShell:  
```PowerShell
Get-FileHash -Path Z:\Path\to\ISO.iso -Algorithm SHA256
```  
Both of the examples above will produce a SHA256 hash for the ISO you downloaded; if it matches that listed in the download directory and on the CentOS Project site, you know that your ISO hasn't become corrupt during download, and can be reasonably assured that it hasn't been interfered with. For more information on validating your download, go to <https://wiki.centos.org/TipsAndTricks/sha256sum>.

## Initial Build
### Partitioning
Something I found disappointing is that installing CentOS 7 using text mode doesn't allow you to customise the partitions or create logical volumes beyond the default setup. The only way to complete this next task is using the graphical installer, which is the default option when booting the image. There is also the option of using a Kickstart file, but that's a topic for another guide.

Your partition sizes will vary depending on the size of the disk available and the intended use of the server, but there are some basic rules that apply no matter the circumstance:
1. Have separate `/boot` and `/swap` partitions.
2. 250MB for `/boot` is sufficient for many cases, 500MB is comfortable for pretty much anything you're going to be doing. The 1GB partition I'm using is decadent, but storage is cheap.
3. `/swap` should be twice the amount of RAM up to 2GB, and equal to any RAM above that. Here's a simple formula for calculating swap, where M=RAM(GB), and S=swap(GB):
```
if M<=2
    S=M*2
else S=M+2
```
Again, this is going to depend on the application(s) you'll be using - if you know it's going to be RAM-intensive you might want to allocate a larger `/swap`.
4. Create separate `/` (`root`) and `/home` partitions. In my case the sizes are easy - I'm creating this image for personal use, so I'll be the only user and have no requirement for a large `/home` directory. The minimum size for a `root` partition on a minimal install is 3GB; you'll want to add additional space based on your intended use. Installing, say, a full LAMP stack might only take a couple of hundred MB with dependencies, but look at the _installed size_ of the packages you'll be using to be sure of your needs.
5. Follow the principle of least privilege when setting mount options. Mounting `/tmp` and/or `/var/tmp` in a dedicated partition and setting the `noexec` mount option will deny the ability to execute files from those directories, which is a common practice for attackers during lateral movement and privilege escalation, as those directories often have `rwx` permissions for low privilege users such as `www-data`. Likewise, the `nosuid` and `nodev` options will prevent many exploits and foil all but the most determined attacker.
6. Allocate the minimum amount of disk space for each partition. Go ahead and give your system a 1TB disk if you want, but don't be afraid to leave 95% of the disk unallocated. It's much easier to extend into unallocated space than it is to shrink allocated space so don't get greedy, plan for the future.

Following on from point 6, we're going configure the partitions as _Logical Volumes_ and place each into one of two _Logical Volume Groups_, `lg_os` and `lg_data`. This will make the process of giving more space to, or adding new partitions much easier. Logical volumes can also span multiple physical disks, so it will also be easier to extend physical storage while maintaining our partition scheme.  
At the first screen of the graphical installation (choosing installation language), you'll see a menu with numerous categories of configuration. The one we're interested in for this step is `Installation Destination`. It should show that automatic partitioning has been selected; this is the default and we're about to change that. Enter the menu, make sure your desired installation disk is selected, and that you select the option to manually configure partitioning before hitting 'Done'. You should now find yourself at a screen where you can create the partitions, with a dropdown list to select `Standard Partition`, `LVM`, among other options. For now, select `Standard Partition` and then create mount points as follows:

| Mount Point    | Filesystem | VG Name | LV name      | Space |
| -------------- | ---------- | ------- | ------------ | ----- |
| /boot          | ext4       |         | lv_boot      | 1GB   |
| swap           | swap       | lg_data | lv_swap      | 4GB   |
| /              | xfs        | lg_os   | lv_root      | 3GB   |
| /home          | xfs        | lg_data | lv_home      | 1GB   |
| /var           | xfs        | lg_os   | lv_var       | 2GB   |
| /tmp           | xfs        | lg_os   | lv_tmp       | 1GB   |
| /var/tmp       | xfs        | lg_os   | lv_var_tmp   | 1GB   |
| /var/log       | xfs        | lg_os   | lv_var_log   | 1GB   |
| /var/log/audit | xfs        | lg_os   | lv_log_audit | 1GB   |

The distinction here between `lg_os` and `lg_data` is that the latter is somewhere users will be expected to write data, whereas the former will be partitions largely for use by the system, rather than direct interaction by a user. To illustrate this, we could add a mount point `/var/www`, which is somewhere a user would place files to make a website; thus, the volume would belong in the `lg_data` group.  
You'll note the table above shows only 15GB allocated. If we were to add `/var/www` with, say, 5GB space, we would first extend the `lg_data` group's maximum capacity by 5GB, then create the 5GB logical volume `lv_var_www` within the `lg_data` group, with a mount point of `/var/www`.

Once you're happy with your configuration, hit 'Done' and you should see a summary of the changes with a prompt to confirm before writing to disk. Following the example above, you'll see the disk first being cleared of all partitions, a new partition table being created, followed by three new partitions (`sda1`, `sda2` and `sda3`) and the creation of our logical volume groups, volumes and mount points.

On confirming your changes you'll be returned to the main configuration menu; the other options here will be configured during the rest of this process, so complete the installation. You will need to set a password for the root user, but don't bother creating a non-root user. Of course, it's best practice to create a non-root user and elevate using `sudo` to perform administrative tasks, but this guide is based on the premise of creating a baseline image we can deploy throughout our environment to serve many different purposes, so we don't yet know what users might be needed; however, if you do, go ahead and create them here.

### Securing Mount Options
Once installation is complete and the system has rebooted, log in and enter the command `cat /etc/fstab`. You should see something like this:
```Shell
/dev/mapper/lg_os-root  /                       xfs   defaults    0 0
UUID=69ffcedf-fd87-4121-a929-75f0ea4b0bd1 /boot                       ext4      defaults        1 2
/dev/mapper/lg_data-home    /home                       xfs   defaults    0 0
/dev/mapper/lg_os-tmp   /tmp                       xfs   defaults    0 0
/dev/mapper/lg_os-var   /var                       xfs   defaults    0 0
/dev/mapper/lg_os-var_log   /var/log                       xfs   defaults    0 0
/dev/mapper/lg_os-var_log_audit   /var/log/audit                       xfs   defaults    0 0
/dev/mapper/lg_os-var_tmp   /var/tmp                       xfs   defaults    0 0
/dev/mapper/lg_data-swap    swap                       swap   defaults    0 0
```
Your result may differ depending on how you've set up your partitions, but what you really need to pay attention to are the fourth, fifth and sixth fields. The fourth field is a comma-separated list of mount options; the fifth field is `dump`, which determine whether files need to be backed up (`0` is no, `1` is yes); and the sixth field is `pass`, which tells `fsck` when to check the filesystem for errors (`0` is never, `1` is first and should be set for the root filesystem only, and `2` is after the root filesystem). Edit the file with `vi /etc/fstab` and change the settings according to your needs. For this guide, the result is the following:
```Shell
/dev/mapper/lg_os-root  /                       xfs   defaults    1 1
UUID=69ffcedf-fd87-4121-a929-75f0ea4b0bd1 /boot                       ext4      defaults,nosuid,noexec,nodev        1 2
/dev/mapper/lg_data-home    /home                       xfs   defaults    1 2
/dev/mapper/lg_os-tmp   /tmp                       xfs   defaults,nosuid,noexec,nodev    1 2
/dev/mapper/lg_os-var   /var                       xfs   defaults,nosuid    1 2
/dev/mapper/lg_os-var_log   /var/log                       xfs   defaults,nosuid,noexec,nodev    1 2
/dev/mapper/lg_os-var_log_audit   /var/log/audit                       xfs   defaults,nosuid,noexec,nodev    1 2
/dev/mapper/lg_os-var_tmp   /var/tmp                       xfs   defaults,nosuid,noexec,nodev    1 2
/dev/mapper/lg_data-swap    swap                       swap   defaults    0 0
```
With the filesystem now configured securely we can move on to the next step. This is a good place to take a snapshot of your progress, if you're working with a VM.

## SSH Hardening
Chances are you'll be connecting to this machine using SSH, so we'll secure the service before moving on to networking. Find and alter, or add, the following lines in `/etc/ssh/sshd_config`.

Explicitly disable SSH Protocol v1:
```Shell
Protocol 2
```
Depending on how you're following this guide and for what purpose, you might still need `root` access over SSH. I'm creating this image to be used as a template in VMWare, so I'll add users, services, and the final hardening touches based on the role of the machine, as appropriate. However, when the time comes, if you want to prevent `root` from logging in over SSH:
```Shell
PermitRootLogin no
```
By default, SSH access is implicitly allowed for all users, so find/add the following line with a space separated list of usernames that are explicitly allowed SSH access:
```Shell
AllowUsers USER1 USER2
```
Prevent empty passwords:
```Shell
PermitEmptyPasswords no
```
Do not allow SSH users to pass environmental variables to `sshd` (largely arbitrary if you give users fully interactive shells):
```Shell
PermitUserEnvironment no
```
Set the idle timeout in seconds (e.g. 600 for 10 minutes):
```Shell
ClientAliveInterval 600
```
Ensure the timeout occurs immediately:
```Shell
ClientAliveCountMax 0
```
The `.rhosts` file can be exploited to attack your system, either being manipulated directly by the attacker or through vulnerabilities mistakenly introduced by your users, so you should prevent SSH from using it:
```Shell
IgnoreRhosts yes
```
Prevent host-based authentication (to hinder pivoting):
```Shell
HostBasedAuthentication no
```
When IPv6 is disabled, `sshd` will have a tendency to generate persistent errors, so change the line
```Shell
#AddressFamily any
```
to:
```Shell
AddressFamily inet
```
Uncomment the line:
```Shell
#ListenAddress 0.0.0.0
```
This will force `sshd` to use IPv4 only, preventing IPv6 errors.

Restart the service with:
```Shell
systemctl restart sshd
```
You should use public key authentication for increased security - information on this can be found in section 7 of [this guide](https://wiki.centos.org/HowTos/Network/SecuringSSH "Centos how-to Securing SSH").  
It would be wise to review the ciphers used and ensure they comply with your particular requirements/standards (e.g. FIPS). The ciphers are a comma separated list following the keyword `Ciphers` in `/etc/ssh/sshd_config`.

## Networking
### Firewall
Before we actually establish a network connection, let's do a bit of housekeeping, starting with the most obvious: the firewall. You're probably accustomed to using `iptables` but CentOS 7 uses the `firewalld` service.  
Try this and you'll get no results:
```Shell
systemctl list-units --type service | grep iptables
```
Whereas this will show you the `firewalld` service up and running:
```Shell
systemctl list-units --type service | grep firewalld
```
_There appears to be a large divide between users of firewalld and iptables. As with systemd Vs. init, Linux Vs. Windows, PC Vs. console, etc: I'm not interested. My philosophy is to use the best tool for the job. If two different tools do the same job to the same standard, use whichever you're most comfortable with or have immediately to hand. In this case systemd and firewalld are immediately to hand so those are the tools I'll be using. Take it from me, stepping outside of your wheelhouse is how you 'git gud'._

I'm not going to give you a primer on `firewalld`. If there's demand for it, I will publish a new post and link to it here, but it's beyond the scope of this guide, so I'll leave you a link to their [documentation](https://firewalld.org/documentation/concepts.html "firewalld Concepts") in the meantime and just give you the commands I used so you can replicate (or closely approximate) the same setup:
```Shell
# Check current state
firewall-cmd --state
# Set default zone to `Internal`
firewall-cmd --set-default-zone=internal
# Get information about the zone, including allowed services
firewall-cmd --zone=internal --list-all
# Adjust services allowed in the zone. To allow/remove a service for this runtime only (e.g. for testing), remove the `--permanent` flag
firewall-cmd --zone=internal --permanent --remove-service=mdns
firewall-cmd --zone=internal --permanent --remove-service=samba-client
firewall-cmd --zone=internal --permanent --remove-service=dhcpv6-client
# Log dropped/rejected packets (unicast, broadcast, multicast, off or all)
firewall-cmd --set-log-denied=unicast
# Apply the `internal` zone to our network interface (my interface is called `ens33` - find yours with `ip addr show`)
firewall-cmd --zone=internal --change-interface=ens33
# Check your changes
firewall-cmd --zone=internal --list-all
```
### Protocol Configuration
With the firewall basics out of the way, we'll configure the rest of the networking. First, we'll disable usage of IPv6 because we're not using it. If you are using IPv6 in your network, you can adjust this section accordingly, including `firewalld` configuration.  
First, the best recommendation I could find around this subject is not to disable the IPv6 kernel module (by editing `/etc/modprobe.d/disabled.conf`) because this can cause issues with some applications, most notably SELinux ([Centos FAQ](https://wiki.centos.org/FAQ/CentOS7#head-8984faf811faccca74c7bcdd74de7467f2fcd8ee "CentOS Wiki - How do I disable IPv6?"), [RHEL SELinux issue thread](https://bugzilla.redhat.com/show_bug.cgi?id=641836 "RHEL Issue 641836"), [Dan Walsh's blog entry](https://danwalsh.livejournal.com/47118.html "How should you disable IPV6?")). As such, we could start by editing `/etc/sysctl.conf` to add these lines:
```Shell
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
```
However, it would be better to leave the original `/etc/sysctl.conf` untouched, to make changing or reverting easier. What we'll do instead is add the above lines to a new file: `/etc/sysctl.d/disable-ipv6.conf`. It's worth noting that there is a naming convention of `##-your-file-name.conf`, where the first two digits of the files determine the sequence in which the files are executed. This would be useful if you have a lot of changes to make to `sysctl.conf` and you want to group them in a logical format for easier administration (if you've seen good, bad and/or ugly Active Directory GPOs, you know what I'm talking about).  
You could use the command `sysctl <variable>=<value>` to test the settings, but the change will not persist after reboots unless the new variable value is added to either `/etc/sysctl.conf` or a file in the `/etc/sysctl.d/` directory. Any time you change `sysctl` settings you can use the command `sysctl --system` to reload settings from all configuration files, which saves you having to reboot.  
After disabling IPv6, I found that `postfix` started to throw constant errors ("no local interface found for ::1" was the giveaway of the cause). To stop it, edit `/etc/postfix/main.cf` and change `inet_protocols = all` to `inet_protocols = ipv4`.  
Next, we'll secure IPv4 by adding the following lines to `/etc/sysctl.d/secure_ipv4.conf`. You can check the current value of these variables by using the command `sysctl <variable>`; these are the desired values:
```Shell
net.ipv4.ip_forward = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_max_syn_backlog = 1280
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_timestamps = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.default.rp_filter = 1
```
I've been assuming that this machine will be assigned a static IP, and we'll be disabling the DHCP client later, but if you will be using DHCP you'll want to take this step to prevent zero-configuration networking (using a 169.254.0.0 address after failure to obtain a DHCP lease). In `/etc/sysconfig/network` add the following line:
```Shell
NOZEROCONF=yes
```
### TCP Wrappers
You could supplement your firewall config by using TCP wrappers. Before doing this you might want to check whether or not the applications you'll be using are compatible with TCP wrappers. An example for this build would be:
```Shell
echo "ALL:ALL" >> /etc/hosts.deny
echo "sshd:ALL" >> /etc/hosts.allow
```
### Connecting
Finally, we can give the machine an address and try to connect over SSH. Open `/etc/sysconfig/network-scripts/ifcfg-ens33` (where `ens33` is your interface name, such as `eth0`) and configure as follows, replacing the relevant values with your own:
```Shell
TYPE=Ethernet
DEVICE=ens33
NAME=ens33
HWADDR=ab:cd:ef:12:34:56
BOOTPROTO=static
ONBOOT=yes
GATEWAY=aaa.bbb.ccc.ddd
NETMASK=aaa.bbb.ccc.ddd
IPADDR=aaa.bbb.ccc.ddd
DNS1=aaa.bbb.ccc.ddd
DNS2=aaa.bbb.ccc.ddd
ZONE=internal
```
Add the same name server addresses to `/etc/resolv.conf`:
```Shell
nameserver aaa.bbb.ccc.ddd
nameserver aaa.bbb.ccc.ddd
```
Restart the network service:
```Shell
systemctl restart network
```
And you should now be able to log in via SSH to continue the build.

## Installed Packages
As this guide is based on the minimal install, it's likely that you won't need to remove or disable any of the installed packages.
Assuming you don't need to remove any packages (or already have removed any you don't need), update the installed packages:
```Shell
yum update
```
You should also make sure the system regularly checks for updates. You could automatically install these updates, but I would advise against it so that you can at least review the updates and patch notes before installing. You can do this by using the `yum-cron` package:
```Shell
yum install yum-cron
systemctl enable yum-cron.service --now
```
Then open `/etc/yum/yum-cron.conf` and make sure the following values are set to ensure you're notified about updates but they're not automatically downloaded and installed:
```Shell
update_messages = yes
download_updates = no
apply_updates = no
```
You can also configure the email settings to send notifications to a remote recipient, which would be wise if you're not going to be logging into this machine regularly. Likewise, you may want to set the hourly cron job to automatically install security updates by using the following settings in `/etc/yum/yum-cron-hourly.conf`:
```Shell
update_cmd = security
update_messages = yes
download_updates = yes
apply_updates = yes
```
When you're finished configuring `yum-cron`, restart the service and check the status:
```Shell
systemctl restart yum-cron.service
systemctl status yum-cron.service
```
## Time and Logging
### NTP with Chrony
We should configure the machine to keep time properly, to ensure the best accuracy of logs. The package installed in CentOS 7 by default is `chrony`, so we'll use that rather than `ntp`. Check the settings in `/etc/chrony.conf` and amend it to your requirements (for example, if you already have a time server in your environment, you'll want to configure it as a source in `/etc/chrony.conf`).  
To allow NTP through the firewall, use the command:
```Shell
firewall-cmd --permanent --zone=internal --add-port=123/udp
```
By default, `chrony` will only accept commands from the localhost; if you need to issue commands from a remote host, add the following lines to `/etc/chrony.conf` (where `aaa.bbb.ccc.ddd/xx` is the CIDR address of the remote host form which commands will be received):
```Shell
bindcmdaddress 0.0.0.0
cmdallow aaa.bbb.ccc.ddd/xx
```
For remote control, you will also need to open 323/udp in the firewall:
```Shell
firewall-cmd --permanent --zone=internal --add-port=323/udp
```
The [RedHat documentation](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/system_administrators_guide/sect-understanding_chrony_and-its_configuration#sect-Security_with_chronyc "Redhat - Understanding Chrony") has further information on `chrony`, should you wish to learn more.

### Logging with Rsyslog
With the system time accurately set, now would be as good a time as any to make sure logging is enabled. The minimal install we've been using comes with the `rsyslog` package installed, so just make sure the service starts at boot and is running:
```Shell
systemctl enable rsyslog.service
systemctl start rsyslog.service
```
We'll look at configuring `rsyslog` in another post; for now we can leave the config with default settings and retrieve logs from our `/var/log` partition.  
We should ensure the correct file permissions are set:
```Shell
chown root /var/log            # root owns the directory
chmod 0640 /path/to/audit-file # Owner read/write, group read; maximum
```

## Basic Hardening
Up to this point, while ensuring secure configuration, most of what we've done has been to get the system up and running; from here we'll be looking at configuration more specific to the task of securing the system. First, we'll begin by controlling how users interact with the system, and what they're capable of when they do.  

### Password Quality
First, enforce a secure password policy by editing `/etc/security/pwquality.conf` and amend the values according to your organisation's existing password policy. You should also make corresponding changes to `/etc/login.defs`, otherwise commands that do not leverage PAM tools (such as `useradd`) will not follow your password policy enforcement.  
_There are a couple of schools of thought as far as password policies are concerned. Some believe forcing regular password changes is a good way to deny an attacker the opportunity to crack/brute passwords. I prefer to enforce a longer minimum length of password instead, and force their expiry only if there is indication of a compromise. This means users are more likely to select a pass**phrase**, rather than a pass**word** and, in my experience, users choose much weaker passwords when forced to regularly change them (say, once a month). Whichever approach you use, you can configure the system to enforce your policy here._  
The `pam_quality` module will check user-defined passwords against the rules you've just configured in `/etc/security/pwquality.conf`; in order to actually use the module (i.e. when a user changes their password with the `passwd` command), it should be called in one of the `pam.d` config files. There should already be a line in `/etc/pam.d/system-auth` as follows:
```Shell
password    requisite     pam_pwquality.so try_first_pass local_users_only retry=3 authtok_type=
```
The key here is that the `password` stack is making a call to the `pam_pwquality` module.  
*The RHEL documentation has you add a similar line to `/etc/pam.d/passwd`, but this will cause the module to be called twice on setting a new password, which will prompt the user twice - not particularly user-friendly! However, the [RHEL documentation](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/system-level_authentication_guide/pluggable_authentication_modules "Redhat - PAM") is otherwise a good starting point to learn about PAM.*

### Failed Logins
While you're in `/etc/pam.d/system-auth`, add the following line to the `session` stack immediately after the call to `pam_limits.so`:
```Shell
session    required    pam_lastlog.so showfailed
```
When users log in, they will now see the date, time and source of the last failed login, and the number of failed login attempts since the last successful login.  
In order to implement account lockout after failed logins, add the following two lines immediately below the `pam_unix.so` call in the `auth` stack of both `/etc/pam.d/system-auth` and `/etc/pam.d/password-auth`:
```Shell
auth   [default=die] pam_faillock.so authfail deny=3 unlock_time=600 fail_interval=900
auth   required pam_faillock.so authsucc deny=3 unlock_time=600 fail_interval=900
```
There's quite a bit going on here - it's important `pam_faillock.so` is called first with `authfail` and then the `authsucc` option, so that successful logins reset the failed login counter. The `deny` option sets the acceptable number of failed login attempts, while `unlock_time` sets the amount of time (in seconds) to lock the account, and `fail_interval` sets the duration (in seconds) during which consecutive login failures must be made in order to trigger the lockout condition.

If you force password expiry, you're likely to want to make sure users don't reuse old passwords. In `/etc/pam.d/system-auth`, add `remember=x` where `x` is the number of passwords to remember to the `pam_unix.so` call in the `password` stack. The line should look like this:
```Shell
password   sufficient pam_unix.so sha512 shadow nullok try_first_pass use_authtok remember=24
```
Finally, you should also ensure SHA512 algorithms are used to hash passwords by running the command:
```Shell
authconfig --passalgo=sha512 --update
```

### Interactive Shells
You may or may not want to use `screen` to allow users to lock their terminals; I'm not going to cover it here because I have no use for it (I have a fairly typical environment; admins use Windows workstations that automatically lock after x minutes, etc). However, what I will do is log idle sessions off (because I have a fairly typical environment, where admins will lock their Windows machine with a PuTTY session still connected). This is largely doubling up with the SSH timeout config we've already done, but this will also clean up any local terminal sessions that may be running (such as from a KVM in the server room, or a VMWare console). Create the file `/etc/profile.d/auto-logout.sh` and add the following line:
```Shell
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
```Shell
SUBSYTEM=="block",ATTRS{removable}=="1",RUN{program}="/sbin/blockdev --setro %N"
```
If you have a legitimate need to mount a writeable removable storage device (for example, backing up some config), you can change the last parameter in the line above from `--setro` (read-only) to `--setrw` (read-write); `udev` will detect changes to configuration files and reload accordingly, but you can force a reload if need be by using the command `udevadm control --reload`. You could also target very specific attributes as an exception to your `udev` rule, if you happen to use a particular make and model of removable storage device; use `man udev` for more information.  
Similar rules can be used to block new USB input devices (such as keyboards), which is useful if, say, your server is already connected to a KVM and you know no new input devices should be added.

If you wish to block the mounting of all removable storage devices, you can do so using `modprobe`. Add a file `/etc/modprobe.d/block-usb-storage.conf` containing the line:
```Shell
install usb-storage /bin/false
```

### Securing Cron
A poorly managed `crontab` is a great way to pivot or maintain persistence on a system, so you'll want to make sure only authorised users have access to `cron`. There are a couple of options here: if `/etc/cron.allow` exists, it will act as an explicit whitelist of accounts that can use `cron`, while accounts not present in the file will be implicitly blacklisted; if only `/etc/cron.deny` exists, you'll have an explicit blacklist with an implicit whitelist. If both files exist, `/etc/cron.deny` is ignored. The choice is yours! Blacklist or whitelist, pick whichever suits you and your environment, but I would suggest an explicit whitelist (always) because a user will soon tell you if you've forgotten to whitelist them, but might not be so quick to mention that you've forgotten to blacklist them from something...never forget the principle of least privilege! The allow/deny files are a simple list of system account names, one per line; regardless of the file contents, `root` can always use `cron`.  
Whichever option you pick, just remember to make sure that `root` owns the file and you use `chmod 600` to prevent unauthorised edits! Repeat this process for `/etc/at.allow` and/or `/etc/at.deny` (`at` is like `cron`, but runs tasks at a specific time, as opposed to on a regular schedule).

### Disable Core Dumps
When a program terminates unexpectedly, the kernel will create a core dump, which is a file containing the address space (memory) of the file at the time of crash. They are useful debugging tools, but are of little use on a stable production system and present the added risk of potentially sensitive data being leaked. We're better of just disabling the feature.  
To disable core dumps for all users, first edit `/etc/security/limits.conf` and add the line:
```Shell
* hard core 0
```
This sets a hard limit of size `0` for all users, so they cannot increase the limit in their own sessions.  
You can also do this using `/etc/profile`, or a custom script in the directory `/etc/profile.d/`, if you prefer. Append the line:
```Shell
echo 'ulimit -S -c 0 > /dev/null 2>&1'
```
This will set a soft limit of 0 for every user when they log in. Omit the `-S` option to set both a hard and soft limit of `0`.  
Lastly, you can use `systemd` to prevent the creation of core dumps by editing `/etc/systemd/coredumps.conf` and setting the following values:
```Shell
Storage=none
ProcessSizeMax=0
```
To stop setuid programs creating core dumps, and a configuration file under `/etc/sysctl.d/`, as we have previously, and set the value `fs.suid_dumpable=0` and reload the `sysctl` config with the command `sysctl -p`.  

### Kernel Hardening with Modprobe
We'll use `modprobe` to disable uncommon protocols and filesystems, to exercise more control over how the operating system functions and prevent users (maliciously or otherwise) from doing unexpected things. We could use `modprobe` to blacklist certain kernel modules, but this will only serve to stop them being loaded at boot; they could still be loaded manually or as a dependency of an allowed module. Instead, we'll redirect their install command to `/bin/true`.  
*NB: we're redirecting to `/bin/true` as opposed to `/bin/false` to avoid any potential problems caused by the loading of the module returning a 'false' result. It doesn't appear as intuitive if you look at the config, as `/bin/false` clearly shows a deliberate attempt to make sure something doesn't happen, but let's assume that if you're tuning kernel modules, you know that `/bin/true` would have the same effect.*  
All modules that can be possible loaded are listed in `/lib/modules`. To list them all, use the command:
```Shell
find /lib/modules/$(uname -r) -type f -name '*.ko*'
```
You can `grep` the results to find particular modules. The following modules are present that should be blocked from loading:
```Shell
echo "install cramfs /bin/true" > /etc/modprobe.d/cramfs.conf
echo "install squashfs /bin/true" > /etc/modprobe.d/squashfs.conf
echo "install udf /bin/true" > /etc/modprobe.d/udf.conf
echo "install dccp /bin/true" > /etc/modprobe.d/dccp.conf
echo "install sctp /bin/true" > /etc/modprobe.d/sctp.conf
```
There may be more depending on your use case and requirements, but these are a good place to start in general.

## Advanced Hardening
### Securing GRUB2 and Boot
GRUB 2 gives you two options: password authentication for modifying the boot menu entries, or password authentication for modifying the boot menu *and* for booting one of those menu entries, effectively restricting single user mode to password authentication. The procedure for both is documented [here](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/system_administrators_guide/sec-protecting_grub_2_with_a_password "Redhat - Protecting GRUB 2 With A Password"), but I'll summarise. First,  run the command `grub2-setpassword` as root and you'll be prompted to enter the password. Once you've done so, you'll have enabled the first of the two options mentioned above. To take things a step further and require a password for booting the GRUB 2 menu options, open `/boot/grub2/grub.cfg` and find the lines beginning with `menuentry`. For those menu entries that you want to protect with the GRUB 2 password, remove the `--unrestricted` option from the parameter block. These changes will persist after reboots, but if you ever rebuild the config using `grub2-mkconfig` the changes will be overwritten and you'll need to redo them.  
*IMPORTANT! If you've chosen the second option, don't lose the GRUB 2 password! Just don't put yourself through that pain!  
NB: Check any regulatory requirements that may apply to your environment/organisation; I'm not familiar with the standard, but I've read in the OpenSCAP documentation that FISMA Moderate requires the superuser account used for protecting the bootloader is not the root account. Do your homework before proceeding!*

To further protect your system from unauthorised reboots, consider disabling the `ctrl+alt+del` keyboard shortcut using the command `systemctl mask ctrl-alt-del.target`. The result will be a symlink from `/etc/systemd/system/ctrl-alt-del.target` to `/dev/null`, rendering the keyboard shortcut useless.

### AIDE
AIDE is a utility that monitors file integrity and detects host intrusions. If you're unfamiliar with File Integrity Monitoring, I would suggest researching the principles before proceeding.  
You may already have FIM/HIDS in your organisation, in which case you should follow the documentation for those systems to see how best to integrate them into this build, rather than introduce new and unfamiliar tools.  
Before using AIDE, you should disable prelinking. Due to the way prelinking changes binaries, it can interfere with AIDE's normal operation and you will not get the best results. First, check the `prelink` package is actually installed (it wasn't on the image I used for this build). If not, move on. If it is, edit `/etc/sysconfig/prelink` and make sure the line `set PRELINKING=no` is present, then run the command `/usr/sbin/prelink -ua` to disable any established prelinking on existing binaries.

Install AIDE using the command `yum install aide`. Review and customise the config in `/etc/aide.conf` then, when you're satisfied, run `aide --init` to generate the initial database that will be used by the utility to monitor file integrity. This may take a few minutes, but when it's done you'll be shown the path to the database. To start using the database, remove the `.new` substring from the filename:
```Shell
mv /var/lib/aide/aide.db.new.gz /var/lib/aide/aide.db.gz
```
You should now schedule a periodic scan using `crontab`. It's not necessary (or recommended) to run the job more than daily, but how often and when you run the job is going to be up to your requirements and strategy. For instance, the quietest period in my environment is between 0300-0400hrs, so I've scheduled the scan daily for 0330hrs by using the `crontab -e` command and editing the file as follows:
```Shell
30 3 * * * /usr/sbin/aide --check
```
You can use the same `aide --check` command to manually run a scan. It's unlikely the machines I'll be using with this build will be switched off often, but if you think yours will you should use `anacron` instead of `cron`, as this will run the job after booting if the machine was off during the normal scheduled time.  
To avoid false positives, be sure to update your database after changes to your system, such as package updates or changes to configuration files, by using the command `aide --update` and follow the database renaming process, as you did with `aide --init`, overwriting the existing (old) database.

### Auditd
Audit logging is as important as it is detailed in scope. I'm going to assume that if you've come this far, you're pretty serious already about IT security so you've got at least a fair idea about what audit logging is. If you're in a regulated environment of some sort, such as under PCI-DSS auditing, you'll at least know that you need to employ audit logging. If this is a completely new concept to you, I suggest you do some research on the topic and how it will matter to you before you proceed further, starting [here](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/security_guide/chap-system_auditing "Redhat System Auditing").  
The `audit` package should already be installed, but use `yum install audit` if it's not. You'll remember that we created a separate mount point for `/var/log/audit`; this is the default log file location, and having it mounted on a separate partition will allow the Audit daemon to get a more accurate reading of the available space, as well as keeping the audit logs safe from other logs consuming all the space in the `/var/log` directory. There are a number of configuration options to consider, and what values you use will depend on your internal policies. If you're not in a strictly regulated environment - say, you don't have any regulatory requirements - you will probably do just fine with the default configuration, but you should understand the options available nonetheless. Use `man auditd.conf` and review the default `/etc/audit/auditd.conf` to learn more. In particular, you'll want to pay close attention (and may want to customise) the following parameters:
```Shell
log_file                # If you've followed this guide, the default location is sufficient
max_log_file            # The maximum size of a single log file
max_log_file_action     # The action to take once the max_log_file limit is reached. Options are `ignore`, `syslog`, `suspend`, `rotate` and `keep_logs`.
num_logs                # If you've set max_log_file_action to `rotate`, this sets the number of log files to keep.
space_left              # How much free space should be left on the partition before space_left_action is triggered.
space_left_action       # Action to take when partition free space reaches limit set by space_left. Options are `ignore`, `syslog`, `rotate`, `email`, `exec`, `suspend`, `single`, or `halt`.
admin_space_left        # The absolute acceptable minimum amount of space free; triggers admin_space_left_action.
admin_space_left_action # `ignore`, `syslog`, `rotate`, `email`, `exec`, `suspend`, `single`, or `halt`.
disk_full_action        # Triggered when there's no free storage space. Options are `ignore`, `syslog`, `rotate`, `exec`, `suspend`, `single`, or `halt`.
disk_error_action       # Triggered on error writing logs to disk or rotating logs. Options are `ignore`, `syslog`, `exec`, `suspend`, `single`, or `halt`.
flush                   # Settings for flushing audit records to disk. Options are `none`, `incremental`, `incremental_async`, `data`, or `sync`.
freq                    # If setting flush to `incremental_async`, freq determins how many records can be sent to disk before forcing a hard sync.
```
Knowing what you're going to be auditing is a big part of the configuration and, considering we're building this image as a template for future systems, the audit rules and config we're going to be using are by no means a final product. One thing to consider is whether or not you'll be logging to a remote logging server and, if so, will you also want to send audit logs to that server? `auditd` will not natively send audit logs to a remote server and you must instead use the `audispd` syslog plugin; open `/etc/audisp/plugins.d/syslog.conf` and change the value of `active` to `yes`. You audit logs will now be sent to `/var/log/messages`, as well as `/var/log/audit/audit.log`.  
Before you configure the audit rules and start the service, it would be a good idea to audit the process that start before `auditd` at boot. Edit `/etc/default/grub` and add `audit=1` to your `GRUB_CMDLINE_LINUX` line.  
You should now be ready to create your audit rules. Again, because this is going to be dependent on your use-case, all I'm going to do is provide an example that I've used as a baseline; I'm not going to use this image in a regulated environment...more of a 'security-conscious' environment. There are several things to consider here. First, your rule order matters. The rules will be read sequentially in the file, so placing your most frequently triggered rules first in the file will optimise performance. Second, add rules to specifically ignore events that don't matter to you, to cut down on the amount of data logged. Review [this article](https://linux-audit.com/tuning-auditd-high-performance-linux-auditing/ "Tuning auditd Linux Auditing") for more detailed tips on tuning `auditd` performance. Rules-wise, you can either add all the rules to `/etc/audit/audit.rules` or you can create separate `.rules` files in the directory `/etc/audit/rules.d/`. For the latter option, the `augenrules` utility will compile the rules in these files into `/etc/audit/audit.rules`. For more information, consult `/usr/share/doc/audit/rules/README-rules`.  
The rules I've used in my base image are a combination of those described in [Arr0way's guide](https://highon.coffee/blog/security-harden-centos-7/#auditd-rules-etcauditauditrules "Arr0way's Audit Rules") and those found [here](https://github.com/gds-operations/puppet-auditd/pull/1 "Audit rules config used by gov.uk"):
```Shell
# Remove any existing rules
-D

# Buffer Size
-b 8192

# Failure Mode
# Possible values are 0 (silent), 1 (printk, print a failure message),
# and 2 (panic, halt the system).
-f 1

# Audit the audit logs.
# Successful and unsuccessful attempts to read information from the
# audit logs; all modifications to the audit trail
-w /var/log/audit -k audit_log

# Auditd configuration.
# Modifications to audit configuration that occur while
# the audit collection functions are operating.
-w /etc/audit/ -p wa -k audit_config
-w /etc/libaudit.conf -p wa -k audit_config
-w /etc/audisp/ -l wa -k audisp_config

# Monitor for use of audit management tools
-w /sbin/auditctl -p x -k audit_tools
-w /sbin/auditd -p x -k audit_tools

# Special files
-a exit,always -F arch=b32 -S mknod -S mknodat -k special_files
-a exit,always -F arch=b64 -S mknod -S mknodat -k special_files

# Mount operations
-a exit,always -F arch=b32 -S mount -S umount -S umount2 -k mount
-a exit,always -F arch=b64 -S mount -S umount2 -k mount

# Time adjustments
-a exit,always -F arch=b32 -S adjtimex -S settimeofday -S clock_settime -k time_changes
-a exit,always -F arch=b64 -S adjtimex -S settimeofday -S clock_settime -k time_changes
-w /etc/localtime -p wa -k time_changes

# cron config and scheduled jobs
-w /etc/cron.allow -p wa -k cron
-w /etc/cron.deny -p wa -k cron
-w /etc/cron.d/ -p wa -k cron
-w /etc/cron.daily/ -p wa -k cron
-w /etc/cron.monthly/ -p wa -k cron
-w /etc/cron.hourly/ -p wa -k cron
-w /etc/crontab -p wa -k cron
-w /var/spool/cron/crontabs/ -k cron

# user, group, password databases
-w /etc/group -p wa -k account_changes
-w /etc/passwd -p wa -k account_changes
-w /etc/gshadow -k account_changes
-w /etc/shadow -k account_changes
-w /etc/security/opasswd -k account_changes
-w /usr/bin/passwd -p x -k account_changes

# Monitor for use of tools to change group identifiers
-w /usr/sbin/groupadd -p x -k account_changes
-w /usr/sbin/groupmod -p x -k account_changes
-w /usr/sbin/addgroup -p x -k account_changes
-w /usr/sbin/useradd -p x -k account_changes
-w /usr/sbin/usermod -p x -k account_changes
-w /usr/sbin/adduser -p x -k account_changes

# Login configuration and information
-w /etc/login.defs -p wa -k login
-w /etc/securetty -p wa -k login
-w /var/log/faillog -p wa -k login
-w /var/log/lastlog -p wa -k login
-w /var/log/tallylog -p wa -k login

# Network configuration
-a exit,always -F arch=b32 -S sethostname -S setdomainname -k network_changes
-a exit,always -F arch=b64 -S sethostname -S setdomainname -k network_changes
-w /etc/hosts -p wa -k network_changes
-w /etc/sysconfig/network -p wa -k network_changes
-w /etc/sysconfig/network-scripts/ -p wa -k network_changes
-w /etc/issue -p wa -k network_changes
-w /etc/issue.net -p wa -k network_changes

# System startup scripts
-w /etc/inittab -p wa -k init
-w /etc/init.d/ -p wa -k init
-w /etc/init/ -p wa -k init

# Kernel parameters
-w /etc/sysctl.conf -p wa -k sysctl

# PAM configuration
-w /etc/pam.d/ -p wa -k pam
-w /etc/security/limits.conf -p wa -k pam
-w /etc/security/pam_env.conf -p wa -k pam
-w /etc/security/namespace.conf -p wa -k pam
-w /etc/security/namespace.init -p wa -k pam

# postfix configuration
-w /etc/aliases -p wa -k mail
-w /etc/postfix/ -p wa -k mail

# ssh configuration
-w /etc/ssh/sshd_config -k sshd

# This is too noisy currently. Switch it on after deploying image.
# Log all commands executed by an effective id of 0 aka root.
#-a exit,always -F arch=b32 -F euid=0 -S execve -k rootcmd
#-a exit,always -F arch=b64 -F euid=0 -S execve -k rootcmd

# Monitor for use of process ID change (switching accounts) applications
-w /bin/su -p x -k priv_esc
-w /usr/bin/sudo -p x -k priv_esc
-w /etc/sudoers -p rw -k priv_esc

# Modification to Mandatory Access Controls
-w /etc/selinux/ -p wa -k access_control_changes

# Modification to Discretionary Access Controls
-a always,exit -F arch=b32 -S chmod -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S chmod -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S chown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S chown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fchmod -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fchmod -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fchmodat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fchmodat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fchown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fchown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fchownat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fchownat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fremovexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fremovexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fsetxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fsetxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S lchown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S lchown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S lremovexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S lremovexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S lsetxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S lsetxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S removexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S removexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fchmodat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fchmodat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fchown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fchown -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fchownat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fchownat -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S fremovexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S fremovexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S lsetxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S lsetxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S removexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S removexattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b32 -S setxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes
-a always,exit -F arch=b64 -S setxattr -F auid>=500 -F auid!=4294967295 -k permissions_changes

# Capture all failed file access or deletion attempts
-a always,exit -F arch=b32 -S creat -S open -S openat -S open_by_handle_at -S truncate -S ftruncate -F exit=-EACCES -F auid>=500 -F auid!=4294967295 -k file_access
-a always,exit -F arch=b64 -S creat -S open -S openat -S open_by_handle_at -S truncate -S ftruncate -F exit=-EACCES -F auid>=500 -F auid!=4294967295 -k file_access
-a always,exit -F arch=b32 -S creat -S open -S openat -S open_by_handle_at -S truncate -S ftruncate -F exit=-EPERM -F auid>=500 -F auid!=4294967295 -k file_access
-a always,exit -F arch=b64 -S creat -S open -S openat -S open_by_handle_at -S truncate -S ftruncate -F exit=-EPERM -F auid>=500 -F auid!=4294967295 -k file_access
-a always,exit -F arch=b32 -S rmdir -S unlink -S unlinkat -S rename -S renameat -F auid>=500 -F auid!=4294967295 -k file_access
-a always,exit -F arch=b64 -S rmdir -S unlink -S unlinkat -S rename -S renameat -F auid>=500 -F auid!=4294967295 -k file_access

# Monitor module loading and unloading, including modprobe config
-w /sbin/insmod -p x -k modules
-w /sbin/rmmod -p x -k modules
-w /sbin/modprobe -p x -k modules
-w /etc/modprobe.conf -p wa -k modules

# Monitor usage of commands to change power state
-w /sbin/shutdown -p x -k power
-w /sbin/poweroff -p x -k power
-w /sbin/reboot -p x -k power
-w /sbin/halt -p x -k power

# Make the configuration immutable - reboot required to change rules
-e 2
```
Once you've configured your rules, enable and start the service using the commands:
```Shell
service auditd start
systemctl enable auditd
```
And then reboot your system to ensure the auditing rules take effect and everything still starts up correctly. Refer to [this guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/security_guide/sec-creating_audit_reports "Redhat - Creating Audit Reports") on how to create audit reports. Continue to review your audit logs to identify ways to tune the logging for optimisation; not only is every envrionment different, but systems in the same environment will differ greatly in their use, so a ruleset that works for one system might not work for another. As long as you document your configuration and continually monitor the results, you'll find audit logging to be of great benefit.

### Buffer Overflow Protection
Buffer overflows exploit vulnerabilities in software code that allow an attacker to manipulate a program's memory addressing in order to execute their own malicious code. There are measures you can put in place within the OS to help combat this common type of attack. The first is to enable something called Address Space Layout Randomisation (ASLR); this makes it more difficult for the attacker to execute their injected code, because the memory address at which their code begins will be different each time the target program runs, thus harder to call execution. Use the command `sysctl kernel.randomize_va_space` to check the value of the kernel option. It should be `2`, so add `kernel.randomize_va_space=2` to a config file in `/etc/sysctl.d/` if your option is different. To change the setting for the current runtime, use the command `sysctl -q -n -w kernel.randomize_va_space=2`.  
If you're using the 64bit kernel, you should also check to see if your processor supports XD (Execute Disabled, Intel CPUs) or NX (No Execute, AMD processors) and take the relevant steps to ensure it's enabled (more information [here](https://en.wikipedia.org/wiki/NX_bit "Wikipedia's entry on NX")). This isn't applicable to virtual machines.  
You may see other guides that recommend enabling ExecShield - in RHEL7 (and CentOS7), the option is enabled by default and the option has been removed from `sysctl` as a security measure.

### SELinux
SELinux is another topic worthy of its own guide and, on the basis that this build will form a base image from which your other systems can be derived, it wouldn't make sense to go into too much detail in this guide. Simply ensuring the service is enabled and has some baseline configuration is all that's needed for now, as the SELinux policies will need to be tuned to different systems as you build them.  
If you're unfamiliar with SELinux, think of it like a firewall that acts between processes and files. It has a set of policies that dictate how processes can interact with files and each other and, as such, is a great tool for providing really fine-grained access control, making lateral movement and privilege escalation from a compromised process extremely difficult, if not impossible. This access control is **Mandatory Access Control** (MAC), as opposed to the typical Linux policy, which is **Discretionary Access Control** (DAC). Using DAC, based on the `user`, `group`, and `other` permissions, an admin might mistakenly do something like `chmod +rwx` to the `root` home directory. Naturally this could be disastrous, but SELinux assigns a **context** to everything; in this case, the `admin_home_t` **type** to the `root` home directory. Each user can be confined to their own **context**, so even if the DAC policy allows all users rwx permissions on the `root` home directory, SELinux will block access because it's outside the scope of the users' **context**. This doesn't mean you can neglect the standard Linux permissions; SELinux MAC rules are evaluated **after** DAC rules, so if you're missing restrictive permissions and you've left a user unconfined in SELinux, you're going to end up with a bad result. However, this order of evaluation does mean that if restrictive rules already exist in DAC, there'll be no need to evaluate the MAC rules in SELinux, which cuts down a lot of logging and reporting overhead.

There are six SELinux packages installed on your system by default. You can find them using the command:
```Shell
yum list installed | grep -E 'policy|selinux'
```
There are also a number of other optional packages that are not installed by default, but I would recommend three in particular:
```Shell
yum install -y policycoreutils-python policycoreutils-restorecond setools-console
```
These packages contain a number of useful utilities such as `semanage`, `sesearch`, `audit2allow` and `audit2why`, among others. Check the man pages for more information, but basically these tools make analyzing and managing SELinux policies much more consistent and straightforward than trawling through and manually editing config/policy files. `restorecond` is a service that will monitor files and directories listed in `/etc/selinux/restorecond.conf`; these are files and directories that can be altered by applications, resulting in incorrect security contexts, but `restorecond` will automatically restore the correct context according to the configured policies.  
Once you've installed optional packages and you're ready to move on, make sure SELinux is enabled. The command `sestatus` should produce a result like this:
```Shell
SELinux status:                 enabled
SELinuxfs mount:                /sys/fs/selinux
SELinux root directory:         /etc/selinux
Loaded policy name:             targeted
Current mode:                   enforcing
Mode from config file:          enforcing
Policy MLS status:              enabled
Policy deny_unknown status:     allowed
Max kernel policy version:      31
```
The loaded policy name of `targeted` is set in `/etc/selinux/config` with the variable `SELINUXTYPE`. The current mode of `enforcing` is set with the variable `SELINUX` in the same file. Review those options to make sure they meet your requirements.  
Next, ensure `restorecond` is enabled and started:
```Shell
systemctl enable restorecond --now
```

## Conclusion
If you've followed each step in this guide up to this point, you should have a CentOS7 image with enhanced security, ready to be deployed in your environment. Remember that this is only a baseline, and you'll still need to follow best practices with any services you install on top of this image, such as a logging or web server, and you should be mindful to keep it up to date regularly, rather than updating it as and when you need it. From here, your next steps are to integrate the image with whatever deployment systems/strategies you've got, install and harden additional services, and enjoy a network that works while also staying secure!  
The following pages were used as reference material for this guide - I'm including them here in case I haven't already mentioned them. In no particular order:  
**CentOS Project Documentation**  
<https://wiki.centos.org/HowTos/OS_Protection>  
<https://wiki.centos.org/HowTos/SELinux>  
<https://wiki.centos.org/HowTos/Network/SecuringSSH>  
**Redhat Documentation**  
<https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/installation_guide/index>  
<https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/system_administrators_guide/index>  
<https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/security_guide/index>  
<https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/selinux_users_and_administrators_guide/index>  
**Package-specific and Independent Sources**  
<https://highon.coffee/blog/security-harden-centos-7>  
<https://www.cyberciti.biz>  
<https://danwalsh.livejournal.com>
<https://selinuxproject.org/page/Main_Page>  
<https://www.linux.com/learn/linux-system-monitoring-and-more-auditd>  
<https://linux-audit.com/tuning-auditd-high-performance-linux-auditing>  
<https://github.com/linux-audit>  
<https://github.com/Neo23x0/auditd>  
Of course, there are also the man pages of all the commands mentioned in this guide (yes, RTFM is still a thing), and [Wikipedia](https://en.wikipedia.org/wiki/Main_Page "Wikipedia Main Page").  
I welcome any feedback and input from the community, provided it's constructive! I hope you find this guide useful, and I thank you for taking the time to read it!
