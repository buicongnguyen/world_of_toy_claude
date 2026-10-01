// The Lantern Trail's story: every conversation, letter and sign, in English source text.
// Vietnamese lives in trail-vi.js, keyed by these exact strings. The rules never read this file.
//
// A scene is a list of lines {who, text}. `who` is a friend, 'hazel' (a letter), 'fog', 'sign' or
// 'narrator'. A line with `choices` asks a question; each choice names the scene that follows.

export const NAMES = {pip: 'Pip', momo: 'Momo', nori: 'Nori', juniper: 'Juniper', bramble: 'Bramble', hazel: 'Grandma Hazel', fog: 'Old Fog', sign: 'Signpost', narrator: ''};

export const SCENES = {
  intro: [
    {who: 'narrator', text: 'The morning after Lantern Night, a little map came floating down with Hazel’s reply.'},
    {who: 'pip', text: 'Fernhollow! Hazel’s map says the trail home starts there.'},
    {who: 'narrator', text: 'The friends crossed the lantern bridge together, until a gust of silver mist swept them apart.'},
    {who: 'pip', text: 'Momo? Nori? Everyone? …Okay. One step at a time.'},
    {who: 'narrator', text: 'Find your friends. Calm the lonely mist. Light the waystones so Hazel can find her way home.'},
  ],
  sign: [
    {who: 'sign', text: 'FERNHOLLOW · Waystones ahead. Please be gentle with the mist. — H.'},
  ],
  m1: [
    {who: 'pip', text: 'A Mistling! It looks… sad.'},
    {who: 'narrator', text: 'Mistlings are lonely wisps of fog. A warm hug is the only way to calm one.'},
  ],
  m1Won: [
    {who: 'pip', text: 'It turned into a firefly! I think it wants to come along.'},
  ],
  wayCold: [
    {who: 'narrator', text: 'The waystone is cold. Something nearby is still too gloomy for it to light.'},
  ],
  wayLit: [
    {who: 'narrator', text: 'The waystone glows. Everyone feels warm again, and your journey is saved here.'},
  ],
  way1Lit: [
    {who: 'narrator', text: 'The waystone glows. The mist on the bridge melts away like breath on a window.'},
    {who: 'pip', text: 'Hazel’s lights still work! Hold on, everyone, I’m coming.'},
  ],
  bridgeMist: [
    {who: 'narrator', text: 'A thick wall of mist hangs over the bridge. Something warm might clear it.'},
  ],
  momo: [
    {who: 'momo', text: 'Pip! Oh, Pip! They won’t let me finish my tea!'},
    {who: 'pip', text: 'Hold on, Momo. We’ll calm them together!'},
  ],
  momoJoin: [
    {who: 'momo', text: 'Thank you. My paws are still shaking.'},
    {who: 'momo', text: 'Here, moonflower tea for the road. It warms everything it touches.'},
    {who: 'narrator', text: 'Momo joined! Moonflower Tea heals the whole party. Its steam thins the mist on the next bridge.'},
  ],
  nori: [
    {who: 'nori', text: 'Stay back! I can handle them. Probably.'},
    {who: 'pip', text: 'Nori, you don’t have to do it alone!'},
  ],
  noriJoin: [
    {who: 'nori', text: 'Okay. I couldn’t handle them. Thanks, Pip.'},
    {who: 'nori', text: 'Watch my kite, though. It’s the fastest thing on any island.'},
    {who: 'narrator', text: 'Nori joined! Kite Dash calms one Mistling twice as much.'},
  ],
  juniper: [
    {who: 'juniper', text: 'Hoo! Visitors on Old Oak Hill. Hazel left the summit path in my care.'},
    {who: 'juniper', text: 'It opens only for those who can answer a riddle.'},
    {who: 'juniper', text: 'Round and warm, I wake the night. Five of me make the whole sky bright. What am I?',
      choices: [{text: 'A lantern', next: 'juniperRight'}, {text: 'The moon', next: 'juniperWrong'}, {text: 'A firefly', next: 'juniperWrong'}]},
  ],
  juniperWrong: [
    {who: 'juniper', text: 'Hoo-hoo, not quite. Think of the clearing on Lantern Night…'},
    {who: 'juniper', text: 'Round and warm, I wake the night. Five of me make the whole sky bright. What am I?',
      choices: [{text: 'A lantern', next: 'juniperRight'}, {text: 'The moon', next: 'juniperWrong'}, {text: 'A firefly', next: 'juniperWrong'}]},
  ],
  juniperRight: [
    {who: 'juniper', text: 'Splendid! A lantern it is. Every story needs someone to write it down, so I’m coming too.'},
    {who: 'narrator', text: 'Juniper joined! A Riddle puzzles a Mistling for two turns and shows what it loves.'},
  ],
  oakWay: [
    {who: 'juniper', text: 'The Thunder Sulk sits on the hill path. Calm it, and the last waystone will wake.'},
  ],
  bramble: [
    {who: 'bramble', text: '…P-Pip? Is that you?'},
    {who: 'bramble', text: 'I came up last night to keep Hazel’s beacon company. Then the big fog sat on it, and it won’t move.'},
    {who: 'pip', text: 'You came all this way alone? Bramble, that’s the bravest thing I’ve ever heard.'},
    {who: 'bramble', text: 'I’m still scared. But I can hold a shield. And… here, a dragon fruit. For courage.'},
    {who: 'narrator', text: 'Bramble joined! Lantern Shield halves the mist’s chill for two rounds.'},
  ],
  fog: [
    {who: 'fog', text: 'Hmmmm… Everyone leaves. The Keeper left. The lights left.'},
    {who: 'pip', text: 'We came to light the beacon, so Hazel can find her way home.'},
    {who: 'fog', text: '…Then you will leave too. Let the summit stay grey.'},
  ],
  fogHalf: [
    {who: 'fog', text: 'Why… are you still here?'},
    {who: 'pip', text: 'Because friends stay. And Hazel left notes, for you too.'},
  ],
  ending: [
    {who: 'fog', text: '…Warm. I forgot what warm felt like.'},
    {who: 'narrator', text: 'Old Fog shimmered gold, and a thousand fireflies rose from the summit.'},
    {who: 'narrator', text: 'The beacon blazed. Far across the clouds, a single lantern answered.'},
    {who: 'hazel', text: 'Pip, I saw it: every light, every friend. I’m on my way. Save me a seat on the blanket. — Grandma Hazel'},
  ],
  sleepy: [
    {who: 'narrator', text: 'The mist hums a sleepy tune, and everyone dozes off…'},
    {who: 'narrator', text: '…and wakes by the last warm waystone, hearts full again.'},
  ],
  basket: [
    {who: 'narrator', text: 'One of Hazel’s picnic baskets, still packed with fruit.'},
  ],
  basketEmpty: [
    {who: 'narrator', text: 'Only crumbs and a checked napkin left.'},
  ],
  beaconWait: [
    {who: 'narrator', text: 'Old Fog is curled around the beacon. Maybe a friend nearby knows what happened.'},
  ],
  beaconLit: [
    {who: 'narrator', text: 'Hazel’s beacon is shining. The whole trail glows behind you.'},
  ],
};

/** Hazel's notes, hidden one on each islet. Each one you find also calms Old Fog in the last battle. */
export const NOTES = {
  meadow: 'Pip, if you’re reading this, you found the trail. The mist isn’t wicked, only lonely. Be kind to it. — H.',
  pond: 'Momo’s moonflowers grow on Fernhollow too. Tea is just warmth you can hold in your paws. — H.',
  wood: 'Nori, I never once blamed you for the lantern string. Lights go out. Friends light them again. — H.',
  oak: 'Juniper keeps my riddles. Here’s one more: what grows bigger the more you share it? — H.',
  summit: 'Old Fog has kept this beacon company since I left. Please tell it I said thank you. — H.',
};

/** Islets' names, shown when the friends step onto one. */
export const PLACES = {meadow: 'Landing Meadow', pond: 'Lily Pond Glade', wood: 'Toadstool Wood', oak: 'Old Oak Hill', summit: 'Beacon Summit'};
