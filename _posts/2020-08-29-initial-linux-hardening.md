---
title: Initial Linux Hardening
category: Guides
---

This guide will cover the initial steps to take towards hardening a Linux installation in order to prepare it for further use in a typical IT network.

## Contents
{:.no_toc}

* TOC
{:toc}

## Download

The distro used in this guide is CentOS 7 but the principles and methods used can be translated to whatever distro you prefer using. There is a wide range of Linux distros to chose from and the differences between them vary greatly, but if you know your chosen distro well, you should be able to translate the various elements in this guide to your preferred OS.

I chose CentOS 7 for this guide because good guides already exist at [highon.coffee](https://highon.coffee/blog/security-harden-centos-7/ "@Arr0way's CentOS 7 hardening guide") and [centos.org](https://wiki.centos.org/HowTos/OS_Protection "CentOS.org's hardening guide") that I used as a basis to create a hardened image. So far, I've used that image to create a logging server, a HIDS server and a web server.

An important practice in IT security is to reduce the attack surface you present by removing surplus software packages, disabling unnecessary services, and so on. The idea is that with less applications installed and services running, there are less things in your system that could contain a vulnerability. Thankfully, the CentOS Project has done a lot of this hard work for us and made a minimal image available, which only includes the minimum packages required for a functional system.  
For the purpose of this guide I'll be installing from an ISO to a virtual machine in VMWare Workstation configured with a single dual-core socket, 2GB RAM and 50GB HDD.

Go to [centos.org](http://isoredirect.centos.org/centos/7/isos/x86_64/) and select a mirror from which to download the ISO. At the time of writing the image I selected was `CentOS-7-x86_64-Minimal-1804.iso`. Depending on what release is current at the time you're reading this, you may see a different number after `-Minimal-` but the rest of the file name should be the same. You'll also note that there are checksums available in the download directory of your chosen mirror; you can should check these against those listed on the [CentOS Mirror](http://mirror.centos.org/centos/7/isos/x86_64/sha256sum.txt.asc). To validate the checksum in Windows, you can use `certutil.exe` in `cmd`:  

```batchfile
certutil -hashfile Z:\Path\to\ISO.iso SHA256
```  

or Get-FileHash in PowerShell:  

```powershell
Get-FileHash -Path Z:\Path\to\ISO.iso -Algorithm SHA256
```  

Both of the examples above will produce a SHA256 hash for the ISO you downloaded; if it matches the one listed in the download directory and on the CentOS Project site, you know that your ISO hasn't become corrupt during download, and can be reasonably assured that it hasn't been interfered with. For more information on validating your download, go to [centos.org](https://wiki.centos.org/TipsAndTricks/sha256sum).

## Initial Build

### Partitioning

Something I found disappointing is that installing CentOS 7 using text mode doesn't allow you to customise the partitions or create logical volumes beyond the default setup. The only way to complete this next task is using the graphical installer, which is the default option when booting the image. There is also the option of using a Kickstart file, but that's a topic for another guide.

Your partition sizes will vary depending on the size of the disk available and the intended use of the server, so plan accordingly. There are some basic rules that apply no matter the circumstance:

1. Create separate `/boot` and `/swap` partitions.
2. 250MB for `/boot` is sufficient for many cases, 500MB is comfortable for pretty much anything you're going to be doing. The 1GB partition I'm using is decadent, but storage is cheap.
3. `/swap` should be twice the amount of RAM up to 2GB, and equal to any RAM above that. Here's a simple formula for calculating swap, where M=RAM(GB), and S=swap(GB):

    ``` shell
    if M<=2
        S=M*2
    else S=M+2
    ```

4. Create separate `/` (`root`) and `/home` partitions. The minimum size for a `root` partition on a minimal install is 3GB. Remember to add additional space to these partitions based on your intended use.
5. Follow the principle of least privilege when setting mount options. Mounting `/tmp` and/or `/var/tmp` in a dedicated partition and setting the `noexec` mount option will deny the ability to execute files from those directories, which is a common practice for attackers during lateral movement and privilege escalation, as those directories often have `rwx` permissions for low privilege users such as `www-data`. Likewise, the `nosuid` and `nodev` options will prevent many exploits and foil all but the most determined attacker.
6. Allocate the minimum amount of disk space for each partition. Go ahead and give your system a 1TB disk if you want, but don't be afraid to leave 95% of the disk unallocated; it's much easier to extend into unallocated space than it is to shrink allocated space.

To begin, configure the partitions as _Logical Volumes_ and place each into one of two _Logical Volume Groups_, `lg_os` and `lg_data`. This makes the process of adding more partitions or allocating more space much easier. Logical volumes can also span multiple physical disks, so it will also be easier to extend physical storage while maintaining your partition scheme.  
During the graphical installation, select the configuration option `Installation Destination`; it should show the defualt option of automatic partitioning is enabled. Enter the configuration menu, make sure your desired installation disk is selected, and select the option to manually configure partitioning before pressing 'Done'. This will open a screen where you can configure custom partitions, with a dropdown list to select `Standard Partition`, `LVM`, among other options. For now, select `Standard Partition` and then create mount points as follows, with partition sizes according to your needs:

| Mount point    | File system | VG name | LV name      | Size |
|----------------|-------------|---------|--------------|------|
| /boot          | ext4        |         | lv_boot      | 1GB  |
| swap           | swap        | lg_data | lv_swap      | 4GB  |
| /              | xfs         | lg_os   | lv_root      | 3GB  |
| /home          | xfs         | lg_data | lv_home      | 1GB  |
| /var           | xfs         | lg_os   | lv_var       | 2GB  |
| /tmp           | xfs         | lg_os   | lv_tmp       | 1GB  |
| /var/tmp       | xfs         | lg_os   | lv_var_tmp   | 1GB  |
| /var/log       | xfs         | lg_os   | lv_var_log   | 1GB  |
| /var/log/audit | xfs         | lg_os   | lv_log_audit | 1GB  |

The distinction here between `lg_os` and `lg_data` is that the latter is somewhere users will be expected to write data, whereas the former will be partitions largely for use by the system, rather than direct interaction by a user. To illustrate this, we could add a mount point `/var/www`, which is somewhere a user would place files to make a website; thus, the volume would belong in the `lg_data` group.  
You'll note the table above shows only 15GB allocated. If we were to add `/var/www` with, say, 5GB space, we would first extend the `lg_data` group's maximum capacity by 5GB, then create the 5GB logical volume `lv_var_www` within the `lg_data` group, with a mount point of `/var/www`.  
This has assumed a hardware configuration of only one physical disk; logical volume management is a subject in its own right, and is likely something I'll cover separately. If it's something you think you'll need, I suggest researching the subject further before proceeding with this guide, but you will not have a problem if you choose to continue with this guide as-is and later decide to add further disks.

Once you're happy with your configuration, press 'Done' and review the summary of the changes before confirming the write operation. In the case of the example in this section, you'd see the disk first being cleared of all partitions, then a new partition table being created, followed by three new partitions (`sda1`, `sda2` and `sda3`) and the creation of our logical volume groups, volumes, and mount points.

Once your changes are complete, you'll be returned to the main configuration menu. The other options here will be configured during the rest of this process, so just complete the installation. You will be prompted to set a password for the root user, and to create a non-root user. If you intend to use this installation as a baseline image for deployment throughout your environment, you may not know what users should be created, or it may differ depending on the intended final use of the deployed image; in this case, just skip this step and you can build user creation into your deployment process.

### Securing Mount Options

Once installation is complete and the system has rebooted, log in and enter the command `cat /etc/fstab`. You should see something like this:

```shell
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

Your result may differ depending on how you've set up your partitions, but what you really need to pay attention to are the fourth, fifth and sixth fields. The fourth field is a comma-separated list of mount options; the fifth field is `dump`, which determines whether files need to be backed up (`0` is no, `1` is yes); and the sixth field is `pass`, which tells `fsck` when to check the filesystem for errors (`0` is never, `1` is first and should be set for the root filesystem only, and `2` is after the root filesystem). Edit the file with `vi /etc/fstab` and change the settings according to your needs. For this guide, the result is the following:

```shell
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

```shell
Protocol 2
```

Depending on how you're following this guide and for what purpose, you might still need `root` access over SSH. I'm creating this image to be used as a template in VMWare, so I'll add users, services, and the final hardening touches based on the role of the machine, as appropriate. However, when the time comes, if you want to prevent `root` from logging in over SSH:

```shell
PermitRootLogin no
```

By default, SSH access is implicitly allowed for all users, so find/add the following line with a space separated list of usernames that are explicitly allowed SSH access:

```shell
AllowUsers USER1 USER2
```

Prevent empty passwords:

```shell
PermitEmptyPasswords no
```

Do not allow SSH users to pass environmental variables to `sshd` (largely arbitrary if you give users fully interactive shells):

```shell
PermitUserEnvironment no
```

Set the idle timeout in seconds (e.g. 600 for 10 minutes):

```shell
ClientAliveInterval 600
```

Ensure the timeout occurs immediately:

```shell
ClientAliveCountMax 0
```

The `.rhosts` file can be exploited to attack your system, either being manipulated directly by the attacker or through vulnerabilities mistakenly introduced by your users, so you should prevent SSH from using it:

```shell
IgnoreRhosts yes
```

Prevent host-based authentication (to hinder pivoting):

```shell
HostBasedAuthentication no
```

When IPv6 is disabled, `sshd` will have a tendency to generate persistent errors, so change the line

```shell
#AddressFamily any
```

to:

```shell
AddressFamily inet
```

Uncomment the line:

```shell
#ListenAddress 0.0.0.0
```

This will force `sshd` to use IPv4 only, preventing IPv6 errors.

Restart the service with:

```shell
systemctl restart sshd
```

You should use public key authentication for increased security - information on this can be found in section 7 of [this guide](https://wiki.centos.org/HowTos/Network/SecuringSSH "Centos how-to Securing SSH").  
It would be wise to review the ciphers used and ensure they comply with your particular requirements/standards (e.g. FIPS). The ciphers are a comma separated list following the keyword `Ciphers` in `/etc/ssh/sshd_config`.

## Networking

### Firewall

Before we actually establish a network connection, let's do a bit of housekeeping, starting with the most obvious: the firewall. You're probably accustomed to using `iptables` but CentOS 7 uses the `firewalld` service.  
Try this and you'll get no results:

```shell
systemctl list-units --type service | grep iptables
```

Whereas this will show you the `firewalld` service up and running:

```shell
systemctl list-units --type service | grep firewalld
```

_There appears to be a large divide between users of firewalld and iptables. As with systemd Vs. init, Linux Vs. Windows, PC Vs. console, etc: I'm not interested. My philosophy is to use the best tool for the job. If two different tools do the same job to the same standard, use whichever you're most comfortable with or have immediately to hand. In this case systemd and firewalld are immediately to hand so those are the tools I'll be using. Take it from me, stepping outside of your wheelhouse is how you 'git gud'._

I'm not going to give you a primer on `firewalld`. If there's demand for it, I will publish a new post and link to it here, but it's beyond the scope of this guide, so I'll leave you a link to their [documentation](https://firewalld.org/documentation/concepts.html "firewalld Concepts") in the meantime and just give you the commands I used so you can replicate (or closely approximate) the same setup:

```shell
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

```shell
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
```

However, it would be better to leave the original `/etc/sysctl.conf` untouched, to make changing or reverting easier. What we'll do instead is add the above lines to a new file: `/etc/sysctl.d/disable-ipv6.conf`. It's worth noting that there is a naming convention of `##-your-file-name.conf`, where the first two digits of the files determine the sequence in which the files are executed. This would be useful if you have a lot of changes to make to `sysctl.conf` and you want to group them in a logical format for easier administration (if you've seen good, bad and/or ugly Active Directory GPOs, you know what I'm talking about).  
You could use the command `sysctl <variable>=<value>` to test the settings, but the change will not persist after reboots unless the new variable value is added to either `/etc/sysctl.conf` or a file in the `/etc/sysctl.d/` directory. Any time you change `sysctl` settings you can use the command `sysctl --system` to reload settings from all configuration files, which saves you having to reboot.  
After disabling IPv6, I found that `postfix` started to throw constant errors ("no local interface found for ::1" was the giveaway of the cause). To stop it, edit `/etc/postfix/main.cf` and change `inet_protocols = all` to `inet_protocols = ipv4`.  
Next, we'll secure IPv4 by adding the following lines to `/etc/sysctl.d/secure_ipv4.conf`. You can check the current value of these variables by using the command `sysctl <variable>`; these are the desired values:

```shell
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

```shell
NOZEROCONF=yes
```

### TCP Wrappers

You could supplement your firewall config by using TCP wrappers. Before doing this you might want to check whether or not the applications you'll be using are compatible with TCP wrappers. An example for this build would be:

```shell
echo "ALL:ALL" >> /etc/hosts.deny
echo "sshd:ALL" >> /etc/hosts.allow
```

### Connecting

Finally, we can give the machine an address and try to connect over SSH. Open `/etc/sysconfig/network-scripts/ifcfg-ens33` (where `ens33` is your interface name, such as `eth0`) and configure as follows, replacing the relevant values with your own:

```shell
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

```shell
nameserver aaa.bbb.ccc.ddd
nameserver aaa.bbb.ccc.ddd
```

Restart the network service:

```shell
systemctl restart network
```

You should now be able to log in via SSH to continue further configuration.

From here, you should move on to the steps outlined in the guide [Basic Linux Hardening](https://infosecsapper.com/guides/basic-linux-hardening "Basic Linux Hardening guide") and begin making further plans for what applications, if any, will be installed.
