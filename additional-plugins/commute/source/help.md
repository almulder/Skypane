# Commute

Your drive to work with live traffic: when to leave, when you'll arrive, how long the drive takes right now and why
it's slower than usual, with an optional map of your route and the traffic on it. It uses TomTom's map services with
your own free TomTom key.

## Set up

1. **Get a TomTom key.** Make a free account at developer.tomtom.com (no card needed). Copy the key it gives you
   (in the dashboard, under Keys).
2. Paste it into **TomTom key** at the top of this tab. Pick miles or kilometres, how times are shown, and how often
   to check while a drive shows. **Save**.
3. **Add a commute**: a name, your home and work addresses (as you'd type them into a maps app), the time you want to
   arrive at work, how you go (drive, bike or walk), your work days and any spare minutes for parking. Type times either way: 8:30 am or 17:45.
   **Show the way home at** shows the way home for an hour from that time (leave it empty for none).
4. Press **Test**. It finds both addresses and tells you how long the drive takes right now.
5. In the layout builder, add a **Commute** card (Plugins group) and pick the commute. Under **Show** choose
   **Map with times** or **Times only**.

## By bike or on foot

Pick **Bike** or **Walk** under **How you go** and TomTom gives its bike or walking route and time. Traffic doesn't
change those, so the card shows the time, the route and when to leave, without traffic colours or delays, and Skypane
doesn't fetch the traffic map. Trains and buses aren't something TomTom does.

## When the card shows a drive

- **To work:** from an hour before you need to leave until your arrival time.
- **Home:** for an hour from **Show the way home at**.
- **The rest of the time** it rests and says when the next drive will show ("Tomorrow's route shows an hour before you
  need to leave"), so nobody reads an old route.

## What the card shows

- **Leave by**: your arrival time minus the drive time now, minus your spare minutes. Once that time passes it says
  how late you'd be.
- **The drive** right now, with a coloured dot (green clear, amber some traffic, red heavy) and how much longer than
  usual it is.
- **Why it's slower**: what TomTom reports along your route, biggest delay first: an accident, roadworks, a closed road,
  heavy or rush-hour traffic (heavy traffic on weekdays 6:30–9:30 am and 3:30–6:30 pm), with how far along the drive
  it is and the minutes it adds.
- **Map with times** adds the map with the route and live traffic colours. **Times only** shows the times bigger.
- **Tap the card** to check right now (once a minute at most). The card shows "Checking now…".

## How often it asks TomTom

Only while the card shows a drive, and only while a card showing that commute was on screen in the last 15 minutes.
Every panel uses the same answer, so more panels never mean more calls.

- **The drive time and the traffic map:** as often as **Live checks every** says (5 minutes unless you change it;
  2 minutes at the most).
- **The street map:** once a day.
- **Before the morning:** a check every 30 minutes from about three hours before you leave, to work out when to show
  the drive.
- **Resting:** nothing at all.

With one commute that's about 2 hours a day of checks. Even every 2 minutes it stays well inside TomTom's free monthly
allowance: at the time of writing 20,000 routes and 200,000 map squares of each kind, against roughly 2,000 routes and
60,000 traffic squares a month. Keep an eye on your usage in TomTom's dashboard if you add several commutes.

## Your addresses

Your addresses are sent to TomTom once, to find them on the map. After that Skypane keeps only their map points (in the
plugin's private data on this server) and sends TomTom only those. Addresses, map points and your key are never shown
on a panel or written to Skypane's log. The map does show your route, so think about where your panels are.

## Good to know

- Check TomTom's terms for your use when you make the account.
- If TomTom can't be reached, or this month's free allowance runs out, the card keeps showing the last drive time with
  a note over it.
