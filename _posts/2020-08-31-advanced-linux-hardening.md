---
title: Advanced Linux Hardening
category: Guides
---

This guide follows on from the [Basic Linux hardening](https://infosecsapper.com/guides/basic-linux-hardening "Basic Linux Hardening") guide and will cover more intermediate steps you can take to increase the security of your Linux installation.

## Contents
{:.no_toc}

* TOC
{:toc}

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

```shell
mv /var/lib/aide/aide.db.new.gz /var/lib/aide/aide.db.gz
```

You should now schedule a periodic scan using `crontab`. It's not necessary (or recommended) to run the job more than daily, but how often and when you run the job is going to be up to your requirements and strategy. For instance, the quietest period in my environment is between 0300-0400hrs, so I've scheduled the scan daily for 0330hrs by using the `crontab -e` command and editing the file as follows:

```shell
30 3 * * * /usr/sbin/aide --check
```

You can use the same `aide --check` command to manually run a scan. It's unlikely the machines I'll be using with this build will be switched off often, but if you think yours will you should use `anacron` instead of `cron`, as this will run the job after booting if the machine was off during the normal scheduled time.  
To avoid false positives, be sure to update your database after changes to your system, such as package updates or changes to configuration files, by using the command `aide --update` and follow the database renaming process, as you did with `aide --init`, overwriting the existing (old) database.

### Auditd

Audit logging is as important as it is detailed in scope. I'm going to assume that if you've come this far, you're pretty serious already about IT security so you've got at least a fair idea about what audit logging is. If you're in a regulated environment of some sort, such as under PCI-DSS auditing, you'll at least know that you need to employ audit logging. If this is a completely new concept to you, I suggest you do some research on the topic and how it will matter to you before you proceed further, starting [here](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/security_guide/chap-system_auditing "Redhat System Auditing").  
The `audit` package should already be installed, but use `yum install audit` if it's not. You'll remember that we created a separate mount point for `/var/log/audit`; this is the default log file location, and having it mounted on a separate partition will allow the Audit daemon to get a more accurate reading of the available space, as well as keeping the audit logs safe from other logs consuming all the space in the `/var/log` directory. There are a number of configuration options to consider, and what values you use will depend on your internal policies. If you're not in a strictly regulated environment - say, you don't have any regulatory requirements - you will probably do just fine with the default configuration, but you should understand the options available nonetheless. Use `man auditd.conf` and review the default `/etc/audit/auditd.conf` to learn more. In particular, you'll want to pay close attention (and may want to customise) the following parameters:

```shell
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

```shell
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

```shell
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

```shell
yum list installed | grep -E 'policy|selinux'
```

There are also a number of other optional packages that are not installed by default, but I would recommend three in particular:

```shell
yum install -y policycoreutils-python policycoreutils-restorecond setools-console
```

These packages contain a number of useful utilities such as `semanage`, `sesearch`, `audit2allow` and `audit2why`, among others. Check the man pages for more information, but basically these tools make analyzing and managing SELinux policies much more consistent and straightforward than trawling through and manually editing config/policy files. `restorecond` is a service that will monitor files and directories listed in `/etc/selinux/restorecond.conf`; these are files and directories that can be altered by applications, resulting in incorrect security contexts, but `restorecond` will automatically restore the correct context according to the configured policies.  
Once you've installed optional packages and you're ready to move on, make sure SELinux is enabled. The command `sestatus` should produce a result like this:

```shell
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

```shell
systemctl enable restorecond --now
```

From here, you should consult further guides on securing your specific applications (e.g. PHP) and develop ways to automate the implementation of security features throughout your network.
