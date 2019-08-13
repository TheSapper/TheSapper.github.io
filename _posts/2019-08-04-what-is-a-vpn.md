---
title: What is a VPN
permalink: /guides/:title
tags: [beginner, what-is, vpn, privacy]
---

If you've heard the term "VPN" but you're not sure what it is or why it matters, you're in the right place. This quick post will give you the run-down on what VPNs are, how they work and what you might use them for.

## What a VPN is

VPN stands for Virtual Private Network. It is a means of making a network connection more private and secure. I'll explain how it does that in the next section; suffice it to say under normal circumstances your Internet connection is not private. A malicious party with the right skills and tools can spy on your Internet traffic, but your Internet Service Provider (ISP) is also watching everything you do. That's not to say there's a person at your ISP watching a screen and making notes, but they are logging the traffic of all their customers *en masse* for a variety of reasons. And how many of you have used a public connection, such as a cafe's Wi-Fi? You don't really know anything about that access point, but you connect to it and trust that your data, perhaps even your most sensitive data, will be safe from prying eyes.  
With that in mind, think of a VPN as a tunnel between your device and the websites you wish to visit. The only traffic allowed through that tunnel is yours, and nobody can see into the tunnel, meaning nobody can eavesdrop on your communication.

## How a VPN works

As I mentioned, a VPN creates a secure tunnel between your device and the websites you visit, but how does it do this? You're still using the same ISP or cafe WiFi as before, so how is it more secure?  
As a home user, you're most likely to encounter a VPN that works by first establishing a connection with one of the VPN provider's servers; this connection is made using encryption protocols, so the data transmitted over that connection is scrambled to anyone who doesn't have the keys to decrypt it, i.e. anyone who isn't you or the VPN server. Once the VPN server has received and decrypted your data, it will then forward the data to your desired location, e.g. your bank's website. Now, as far as anyone else on the Internet is concerned, including your bank, your connection is actually coming from the VPN server, rather than your true connection, which might be that cafe WiFi. This means anyone snooping on the cafe WiFi is essentially looking in the wrong place, and all they'll ever see is an encrypted connection. Any data sent back from your bank's website would actually be sent to the VPN server, which will take the data, encrypt it, and send it back down the secure connection to you.  
This might sound complicated and a lot of effort, but modern operating systems, including those on smart phones, come with built-in support for VPNs; you'll find that it's often as simple as launching an app to establish the VPN connection and secure your data.  
This is a generalised and simplified explanation of how a VPN works. Getting into the details of the encryption protocols used is beyond the scope of this piece, but it's worth mentioning that there are compatibility issues with certain operating systems and VPN protocols. However, most of the major VPN providers will offer VPN software (known as a "VPN client") for all of the major platforms, meaning you could use the same provider for your Windows PC, iPhone, and Android tablet by simply downloading the app from the respective app stores and letting the software take care of the hard work.

## What a VPN is for

So far we've only talked about privacy and security - indeed, the first VPN protocol was written by Microsoft in the '90s to allow people to work from home by securely connecting to their employers' corporate networks - but are there other uses for a VPN?  
If the VPN server happens to be physically located in another country, then it would appear as though *you* were in that country. This would mean that you could bypass content filters applied by geographic region. For example, media streaming services might make certain movies or TV shows available only to users in a specific country; by connecting to a VPN server located in that country, you'd be able to access those shows and movies.  
There are many governments that make heavy use of Internet surveillance, and VPNs have become a staple tool for journalists and whistleblowers around the globe; be aware, though, that this has led to a number of governments criminalising the use of VPNs - what matters is where you are physically located at the time you're using the VPN, so check the local laws that apply!  
A VPN can also be a good way to avoid having your Internet speed throttled by your ISP; many people still using Torrent services to share legitimate software and media, but most ISPs will put a limit on customers' speeds if they see that kind of activity. If you're using a VPN, your ISP will not be able to recognise what kind of data is being transmitted, including peer-to-peer file sharing, so they won't be able to limit your download speeds.
