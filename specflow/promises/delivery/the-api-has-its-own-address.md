---
id: P-DELIVERY-7
title: "The API has its own address"
status: draft
---
# The API has its own address

## Outcome

The apps can reach LevApp's server at `api.levapp.app` instead of only through the website's address, so the website can later move to a faster host without the apps losing the server, and the server has its own logs and limits (PAD-613). Until the owner switches a build, everything works as today.

- The old address (`levapp.app/api`) keeps working for as long as any installed app uses it.
- Only LevApp's own websites may call the API from a browser on another address.
- Live updates, activation links and the logs' token protection behave the same on the new address.
- Nothing changes for users until the owner switches a build.

It does not promise moving the website off the server, or retiring the old address.
