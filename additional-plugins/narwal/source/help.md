# Narwal robot vacuum

Shows and runs your Narwal robot vacuum on your panels, talking to the robot directly on your home network.

**Works with** Narwal robots that offer local control: Flow, Flow 2, Freo Z10 Ultra and Freo X10 Pro. Freo X Ultra,
Freo Z Ultra and Freo X Plus are cloud-only and won't answer.

## Set up
1. **Add a robot** here: a name for the panels and the robot's address (your router's device list shows it). Give it a
   fixed address in the router so it doesn't change.
2. Press **Test**. Skypane finds the robot, its software and battery, and remembers its ids. There's no password.
3. In the layout builder, add a **Robot vacuum** card (Plugins group) and pick the robot in its settings.

## Good to know
- The robot talks to **one thing at a time**. While the Narwal app is open on a phone, Skypane may not reach it for a
  moment; it tries again by itself.
- The map, room names and outlines come from the robot. Changed rooms in the Narwal app? Skypane checks the map after
  every clean and every 30 minutes, or press **Refresh maps now**.
- Turn on the card's **PIN** setting to require the panel PIN before a clean starts.
- What the plugin reaches: TCP port 9002 on the addresses you enter, nothing else.
