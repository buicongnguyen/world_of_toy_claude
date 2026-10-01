// The story of The Lantern Picnic: one evening, five lanterns, and a letter from the Lantern Keeper.
//
// Everything here is presentation data. The rules in lantern-game.js never read it, so the story can
// be rewritten, localised or captioned without touching par, saves or solvability.
//
// Lines are [speaker, text]. Speakers are friend models ('pip', 'momo', 'nori', 'juniper', 'bramble')
// or 'narrator'. Wishes can be presented three ways (the rules always accept the real wish):
//   hidden: {order, after, line, surprise} ... not shown until `after` (an order index) has been served
//   riddle: {order: text}                  ... shown as a riddle until served or hinted
export const NAMES = {pip: 'Pip', momo: 'Momo', nori: 'Nori', juniper: 'Juniper', bramble: 'Bramble', narrator: '', hazel: 'Grandma Hazel'};

export const PROLOGUE = {
  eyebrow: 'A LETTER, TUCKED IN THE PICNIC BASKET',
  body: [
    'Dear Pip,',
    'The lanterns of the clearing have been dark for too long. On Lantern Night, spread the blanket, fill the basket, and light them again: one lantern for every friend who finds their way to you.',
    'I’ve gone to light the far islands. Five lanterns shine bright enough to see from anywhere in the sky. I’ll be watching for them.',
    'P.S. Two little things make one bigger thing. That’s the whole secret.',
  ],
  sign: 'With all my love, Grandma Hazel',
  button: 'Spread the blanket',
};

export const REPLY = {
  eyebrow: 'A LETTER, CARRIED HOME BY A SKY LANTERN',
  body: [
    'Dear Pip,',
    'I saw them. Every one. From the farthest island in the sky, your five lanterns were the brightest thing I have ever seen.',
    'Keep the blanket spread and the basket full. I’m coming home for the next Lantern Night, and I’m bringing new friends.',
  ],
  sign: 'All my love, Grandma Hazel',
  button: 'Stay for the lanterns',
};

export const STORY = [
  { // I · Pip · afternoon
    place: 'The Firefly Clearing',
    intro: [
      ['pip', 'The clearing’s been so quiet since Grandma Hazel went away.'],
      ['pip', 'Her letter says the first lantern is for whoever starts. So… that’s me.'],
      ['pip', 'A berry welcome and a cherry skewer, just like she used to make. Here goes!'],
    ],
    coach: true, // chapter I teaches by pointing at the next good move right away
    barks: {
      firstMerge: [['pip', 'Two little things make one bigger thing. She was right!']],
      serve: [['pip', 'Mm. Tastes like summer.'], ['pip', 'One more and it’s a proper welcome.']],
      skewerDone: [['pip', 'Three cherries, one skewer. Grandma’s favourite.']],
      chain: [['pip', 'Whoa, it just kept going!']],
      share: [['pip', 'A little extra for the table.']],
    },
    outro: [
      ['pip', 'It’s lit! Grandma, look, the first lantern!'],
      ['pip', '…Did something just rustle down by the path?'],
    ],
    celebrate: ['The first lantern is lit.', 'Pip’s little light is shining. Down the hill, a traveller has stopped to look.'],
    memory: 'Pip lit the first lantern alone, and it was enough. Somewhere down the hill, a traveller stopped, and turned toward the light.',
    recipe: 'Berry welcome: two strawberries, a skewer of cherries, and someone brave enough to start.',
  },
  { // II · Momo · golden hour
    place: 'The Path of Stepping Stones',
    intro: [
      ['momo', 'Excuse me… I followed your light. I’ve been hopping between islands for three whole days.'],
      ['pip', 'Three days? You must be starving. Sit, sit!'],
      ['momo', 'Is there… room for one more? I don’t want to be any bother.'],
      ['pip', 'Grandma says a picnic isn’t finished until someone new sits down.'],
    ],
    hidden: {order: 1, after: 0, line: ['momo', 'Oh! And… might I have one pear? For the tea. Only if it’s no trouble.'],
      surprise: ['momo', 'A pear! How did you know? That’s exactly what I was too shy to ask for.']},
    barks: {
      firstMerge: [['momo', 'Oh, clever! We never did it like that back home.']],
      serve: [['momo', 'Oranges taste like the sunsets on my old island.'], ['momo', 'Thank you. Truly.']],
      skewerDone: [['momo', 'Apples on a stick! I haven’t had those since I was little.']],
      chain: [['momo', 'Goodness! Is it always this lively here?']],
      share: [['momo', 'Oh, for the table? How generous.']],
    },
    outro: [
      ['momo', 'I brought moonflower tea from home. I was saving it for a special day.'],
      ['momo', 'I think today might be it.'],
      ['pip', 'Stay as long as you like, Momo. This can be home too.'],
      ['narrator', 'In the ferns at the edge of the clearing, a pair of amber eyes had been watching all afternoon.'],
    ],
    celebrate: ['There’s always room for one more.', 'Momo poured moonflower tea for everyone. The sun is turning gold.'],
    memory: 'Momo left home looking for somewhere to belong, and found it by the second lantern, over a pot of moonflower tea.',
    recipe: 'Taste of sunshine: two oranges, one pear for the tea, and a seat saved for someone new.',
  },
  { // III · Nori · sunset
    place: 'The Lantern Posts',
    intro: [
      ['nori', 'Hmph. The clearing used to be so quiet. Look at it now.'],
      ['momo', 'Nori! You’ve been in those ferns since lunch. Come and sit.'],
      ['nori', 'I was… guarding them. From ferns.'],
      ['nori', 'Fine. One watermelon. The biggest one you can make. Then I’ll go.'],
    ],
    barks: {
      firstMerge: [['nori', 'Not bad. For a bear.']],
      serve: [['nori', '…It’s perfect. Don’t tell anyone I said that.']],
      skewerDone: [['nori', 'Peaches. Hazel used to put peaches on everything.']],
      chain: [['nori', 'Okay, THAT was impressive.']],
      share: [['nori', 'Sharing, huh? Suit yourself.']],
      halfway: [['nori', 'Pip… after this, there’s something I need to tell you.']],
    },
    outro: [
      ['nori', 'Pip. The night the lanterns went dark… that was me.'],
      ['nori', 'I only wanted to borrow one. I tugged the string, it snapped, and every light went out.'],
      ['nori', 'I’ve been sewing bunting ever since. I thought if I made it pretty enough, I could make it right.'],
      ['pip', 'Nori… Grandma never blamed anybody. She said the lanterns were only resting.'],
      ['pip', 'Will you hang it with us?'],
      ['nori', '…Yeah. Okay.'],
    ],
    celebrate: ['The path turns gold.', 'Nori strung paper bunting between the posts. Some knots are easier to untie together.'],
    memory: 'Nori carried a snapped lantern string and a secret for a whole year. At sunset, Nori set both down and hung the bunting where everyone could see it.',
    recipe: 'Moonlit feast: one watermelon as big as the moon, a skewer of peaches, and the truth, told kindly.',
  },
  { // IV · Juniper · dusk
    place: 'Under the Old Oak',
    intro: [
      ['juniper', 'Hoo! I saw your lanterns from the old oak. Three lights! That hasn’t happened in a year.'],
      ['juniper', 'I keep the clearing’s storybook, you know. Every Lantern Night gets a page.'],
      ['juniper', 'But first, a riddle supper. Guess my wishes, and I’ll tell you where Hazel really went.'],
    ],
    riddle: {
      4: 'Sunny and sour, shaped like a little boat.',
      10: 'The colour of the sky just after sunset, with a stone for a heart.',
    },
    riddleHints: {
      4: ['juniper', 'Hoo-hoo. A little boat of sunshine… a lemon, dear!'],
      10: ['juniper', 'Sunset sky, stone heart… a twilight plum, of course.'],
    },
    barks: {
      firstMerge: [['juniper', 'Two becoming one. That’s how every good story starts.']],
      serve: [['juniper', 'Hoo! Clever thing, you guessed it.'], ['juniper', 'Right again! You read riddles like a book.']],
      skewerDone: [['juniper', 'Pears in a row, like words in a sentence.']],
      chain: [['juniper', 'What a plot twist!']],
      share: [['juniper', 'Not in my riddle, but a lovely thought.']],
    },
    outro: [
      ['juniper', 'Now, the story I promised. Hazel is the Lantern Keeper. Not just of this clearing: of every island in the sky.'],
      ['juniper', 'Each Lantern Night, the islands light up, so nobody floating out there ever feels alone.'],
      ['juniper', 'Hazel went to wake the far islands. But they only answer a clearing that shines with five.'],
      ['pip', 'Then we need one more friend.'],
      ['juniper', 'Hoo. I have a feeling they’re closer than you think.'],
    ],
    celebrate: ['A story under the first stars.', 'Juniper’s storybook has one blank page left. It will be written tonight.'],
    memory: 'Juniper’s storybook told the truth: Grandma Hazel hadn’t left the clearing behind. She had gone to make sure every island had someone watching for its light.',
    recipe: 'Storyteller’s supper: two lemons, one twilight plum, and a riddle for dessert.',
  },
  { // V · Bramble · night
    place: 'The Festival of Little Lights',
    intro: [
      ['bramble', 'H-hello. I’m Bramble. I live in the brambles. That’s… that’s why.'],
      ['bramble', 'I’ve been watching all evening. Sorry. I’m not very good at coming out.'],
      ['bramble', 'I brought a lantern of my own. It fell into my bush the night the string snapped. I kept it safe.'],
      ['nori', '…You had it all this time?'],
      ['bramble', 'I was too shy to give it back. Could we… light it together?'],
    ],
    hidden: {order: 0, after: 1, line: ['bramble', 'And… a dragon fruit? It’s the colour of Hazel’s lantern.'],
      surprise: ['bramble', 'Oh! You knew! Nobody ever guesses what I want.']},
    barks: {
      firstMerge: [['bramble', 'Oh! That was nice.']],
      serve: [['bramble', 'Th-thank you.']],
      skewerDone: [['bramble', 'Plums! My favourite. How did you…?']],
      chain: [['bramble', 'Wow…']],
      share: [['bramble', 'That’s okay. Sharing is nice.']],
    },
    outro: [
      ['bramble', 'It’s… it’s so bright.'],
      ['pip', 'Five lanterns, Grandma. Just like you said.'],
      ['juniper', 'Then let’s give the sky something to answer. Everyone, lanterns up!'],
    ],
    celebrate: ['A clearing full of friends.', 'Five lanterns. Five little picnics. Now the whole sky can see.'],
    memory: 'Bramble finally stepped out of the brambles, carrying the lantern that started it all. Five lights became a hundred, and far across the sky, someone wrote back.',
    recipe: 'Festival feast: a dragon fruit, a pineapple, a skewer of plums, and the courage to say hello.',
  },
];

/** Spoken while the festival rises; `cue` lines fire world events on the way. */
export const FINALE = [
  ['juniper', 'Look! Out past the clouds!', 'answer'],
  ['momo', 'Lights… one after another…'],
  ['nori', 'The far islands. They’re answering.'],
  ['bramble', 'One of them is coming this way!', 'reply'],
  ['pip', 'There’s a letter tied to it.'],
];

export const ENDING = 'The lanterns of the clearing are lit again, and every island in the sky knows it.';
