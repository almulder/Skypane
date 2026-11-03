# Calendar event icons: which words show which icon

The panels give each calendar event a small icon and colour, picked from **words in the event's title**. Nothing else
counts: not the description, not the location, not the calendar's name. Since 3.0.2 the admin can change the list:
**Manager → Integrations → Calendars → Event icons** (below). A guide with a "Try a title" box: guides/calendar-icons.html.

## How it picks
- Capital letters don't matter. "DENTIST" and "dentist" are the same.
- The word can sit anywhere in the title: "Jane – dentist 2pm" works.
- **The first match in the list, from top to bottom, wins.** "Hospital surgery" shows the surgery icon, because
  surgery comes first.
- A title with none of the words gets the plain calendar icon.

## Changing the list (3.0.2)
One list for the whole house, kept by the server (`house/event-icons.json`); every panel gets it with its calendar
events and uses a saved change within seconds, without a reload. In **Manager → Integrations → Calendars → Event icons**:
- each row is one icon: its picture (click it to pick another), name, colour, an on / off switch, and its words as
  chips — type a word and press Enter (or a comma) to add it, × to remove it;
- **drag a row** by its ⠿ grip, or use ▲ ▼, to change the order: the first match from the top wins. With Doctor above
  Eyes, "Eye doctor" shows the doctor; with Eyes above, the eye;
- **Add an icon**: a picture, a name and words. It goes to the top; drag it lower if another icon should win first;
- **Try a title**: type an event's name to see which icon wins and which word matched — with the changes not saved yet;
- **Save** keeps the changes; **Undo changes** drops them; **Reset to defaults** brings back the list below (in the
  house's language). Each save and reset is in the activity log.

Limits: at most 60 icons, 30 words per icon, 40 characters per word and per name. A word is kept in lowercase, with
letters, digits, spaces and `.'-&` only. A panel that hasn't heard from the server yet (and the sample house) uses the
default list.

## The default list

| Icon | For | Put one of these words in the title |
|---|---|---|
| 🩹 bandage | Surgery | surgery, operation, procedure |
| 🏥 hospital | Hospital | hospital, er visit, urgent care, emergency room |
| 🦷 tooth | Dentist | dentist, dental, teeth, orthodont, cleaning appointment |
| 👁️ eye | Eyes | eye, eyes, optometr, ophthalmolog, optician, eye exam, vision, glasses, contacts |
| 💊 pill | Pain clinic | pain dr, pain doctor, pain clinic |
| 🐾 paw | Pets: vet | vet, vaccination, vaccine, shots |
| 🐕 dog | Pets: groomer | groom, grooming, dog walk, kennel, boarding |
| ✨ sparkles | Self-care & spa | spa, massage, facial, nails, manicure, pedicure, self-care, relax, mental health day |
| ✂️ scissors | Hair | hair, salon, barber, haircut |
| 🚗 car | Car | oil change, mechanic, car service, tires, inspection, registration, car wash |
| 🩺 stethoscope | Doctor | doctor, dr, dr., checkup, physical, clinic, appointment, appt |
| 💊 pill | Medication | medication, meds, pills, prescription, pharmacy, refill, vitamins, supplements |
| 🎂 cake | Birthday | birthday, bday |
| ❤️ heart | Anniversary & date night | anniversary, wedding, date night |
| 🎁 gift | Holiday | holiday, christmas, thanksgiving, easter, halloween, new year, hanukkah, diwali, eid |
| 🎉 party | Party | party, get-together, bbq, barbecue, celebration, shower |
| ☕ coffee | Coffee & meetups | coffee, catch up, catch-up, meetup, hang out |
| 🍴 utensils | Meals | dinner, lunch, breakfast, brunch, restaurant, potluck |
| 📍 pin | New place to try | try, new place, explore |
| ✈️ plane | Travel & hotels | flight, fly, trip, travel, vacation, airport, getaway, hotel, check-in, check-out, airbnb, stay |
| 📱 phone | Call / keep in touch | call mom, call dad, check in, facetime, keep in touch |
| 💼 briefcase | Work meeting | work, meeting, call, conference, zoom, teams, standup, huddle, client |
| 🧾 receipt | Bills | bill, bills, rent, mortgage, payment, utilities, credit card, due date |
| 🚩 flag | Deadline | deadline, due, submit |
| 🛒 cart | Shopping | shopping, costco, groceries, grocery, store, target, walmart |
| 🎮 gamepad | Games | game night, video game, release, launch, board game |
| 🏋️ dumbbell | Gym & workout | gym, workout, yoga, pilates, run, running, crossfit, training session, spin |
| 🎨 palette | Hobby | craft, crafts, hobby, puzzle, painting class, guitar, piano |
| ⛪ church | Church & prayer | church, temple, mass, service, prayer, mosque, synagogue, bible study, meditation |
| 🎓 school | School | school, class, homework, project, exam, parent-teacher, pta |
| 🏆 trophy | Kids' sports | practice, game, match, soccer, baseball, football, basketball, hockey, swim, tournament |
| 📖 book | Learning & reading | course, study, lesson, training, webinar, lecture, book club, reading, read |
| 👥 users | Community event | festival, market, farmers market, fair, parade, fundraiser, volunteer |
| 🎬 film | Movie & TV | movie, film, cinema, premiere, episode, season, finale |
| 🎟️ ticket | Concert & show | concert, show, theater, theatre, play, recital, gig |
| 👛 wallet | Payday & money | payday, paycheck, budget, savings, taxes, tax |
| 🔄 refresh | Subscription | subscription, renewal, renew, membership, trial ends |
| 🧹 broom | Cleaning & chores | cleaning, clean, laundry, chores, vacuum |
| 🗑️ trashBin | Trash day | trash, garbage, recycling, bins, bulk pickup |
| 🪴 plant | Garden & plants | water plants, plants, garden, gardening, mow, lawn, fertilize |
| 📦 package | Delivery | delivery, package, parcel, shipment, pickup, mail, po box |

(The emoji only describe the icon; the panel draws its own.)

The order settles the overlaps: Call / keep in touch sits above Work meeting ("Call mom" isn't work); Games above
Kids' sports ("Game night"); Gym and Hobby above School ("Yoga class", "Painting class"); Gym's "training session"
above Learning's "training"; Bills above Deadline ("Rent due"); Shopping above Gym ("Costco run"); the vet, groomer,
spa, hair and car above Doctor's "appointment" ("Vet appointment"); Car above Church's "service" ("Car service");
Church above Learning ("Bible study"); Movie above Concert ("Movie theater").

Not icons on purpose: step counts, sleep, mood, gratitude, affirmations, journal — trackers rather than events.

## Tips for titles that show the right icon
- **Start with the kind of event:** "Dentist – Jane", "Vet – Max", "Flight to Chicago", "Dinner at Mario's".
- **Use the plain word:** "Haircut" rather than "Trim"; "Doctor" or "Dr Smith".
- **Mind the first match:** "Work dinner" shows the cutlery, because Meals comes before Work meeting. For the briefcase,
  call it "Team meeting" — or drag Work meeting above Meals.

## Whole words only (since 3.0.2)
A word counts only on its own or with an everyday ending (s, es, er, ers, ing, ed, ist, ists); a word ending in y
also finds its "ies" ("Party" → "Birthday parties"). Accented letters and other alphabets count as letters: "café"
matches "Café" but not "Cafétéria". A word you add needs at least two letters or digits.
- **Still match:** "Groomer", "Orthodontist", "Vets", "Meetings", "Flying", "Dr. Lee", "Eye doctor".
- **No match:** "Painting", "Recall", "Velvet", "Restore", "Bridegroom", "Eyelash" (it isn't the word eye).
- **"Workout"** shows the gym icon, not work; **"Homework"** shows school.
