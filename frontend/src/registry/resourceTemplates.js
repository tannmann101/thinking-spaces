// Resource Templates -- what a given *kind* of Resource is worth asking
// about. Pick "book" as a type when creating a Resource and its three
// facets replace the generic ones; a type with no template here keeps
// the generic three. See pages/CreateResource.jsx.
//
// The fourth facet every Resource gets, Touches / Touched By, is never
// part of a template: it's a mechanical capability (make a Reference to
// an existing Space), not a description that varies by kind of thing.
//
// This was a database table with two editor pages and a seed file --
// roughly 650 lines of machinery to deliver three prompts per type,
// read once at creation. It's a registry file now, the same shape and
// for the same reason as registry/blocks.js and workspaceKinds.js: one
// file to open to see everything the app offers. The trade is real and
// worth stating -- adding a type is a code edit rather than something
// you can do from inside the running app.
export const resourceTemplates = {
  'aphorism': {
    label: "Aphorism",
    facets: [
      { name: "The Saying", prompt: "What is the exact wording?" },
      { name: "What It Means", prompt: "What is your own gloss on it?" },
      { name: "When It Applies", prompt: "When have you actually reached for this?" },
    ],
  },
  'art piece': {
    label: "Art Piece",
    facets: [
      { name: "What It Depicts", prompt: "What is the subject or form of the piece?" },
      { name: "Technique or Choices", prompt: "What formal choices stand out -- medium, composition, technique?" },
      { name: "What It Evokes", prompt: "What does it actually make you feel or notice?" },
    ],
  },
  'article': {
    label: "Article",
    facets: [
      { name: "Thesis", prompt: "What is the article''s central claim?" },
      { name: "Evidence Used", prompt: "What does it lean on to support that claim?" },
      { name: "Your Take", prompt: "Where do you agree or disagree, and why?" },
    ],
  },
  'book': {
    label: "Book",
    facets: [
      { name: "Core Argument or Story", prompt: "What is this book actually arguing, or what does it depict?" },
      { name: "Key Passages", prompt: "Which specific passages, scenes, or quotes are worth remembering?" },
      { name: "Personal Notes", prompt: "What are your own reactions or takeaways so far?" },
    ],
  },
  'debate': {
    label: "Debate",
    facets: [
      { name: "Position For", prompt: "What is the strongest case for this position?" },
      { name: "Position Against", prompt: "What is the strongest case against it?" },
      { name: "Where You Land", prompt: "Where do you actually come down, and why?" },
    ],
  },
  'essay': {
    label: "Essay",
    facets: [
      { name: "Central Claim", prompt: "What is the essay''s central claim?" },
      { name: "Supporting Moves", prompt: "How does the argument actually build?" },
      { name: "Where It\u2019s Weakest", prompt: "Where does the argument feel least convincing?" },
    ],
  },
  'film': {
    label: "Film",
    facets: [
      { name: "Plot / Premise", prompt: "What is the film actually about, on its surface?" },
      { name: "Notable Scenes", prompt: "Which specific scenes are worth remembering?" },
      { name: "What It\u2019s Really About", prompt: "What theme sits underneath the plot?" },
    ],
  },
  'lecture': {
    label: "Lecture",
    facets: [
      { name: "Main Claims", prompt: "What was actually argued or taught?" },
      { name: "Notable Moments", prompt: "Was there a specific example, aside, or turn of phrase worth keeping?" },
      { name: "Open Questions", prompt: "What did it leave unresolved for you?" },
    ],
  },
  'lesson': {
    label: "Lesson",
    facets: [
      { name: "What It Teaches", prompt: "What is the actual skill or knowledge being taught?" },
      { name: "How It\u2019s Structured", prompt: "What is the teaching approach -- steps, examples, drills?" },
      { name: "Where You\u2019re Stuck", prompt: "What still feels unclear or unpracticed?" },
    ],
  },
  'parable': {
    label: "Parable",
    facets: [
      { name: "The Story", prompt: "What literally happens in the parable?" },
      { name: "The Lesson", prompt: "What is it meant to teach?" },
      { name: "Where It Applies", prompt: "What real situation does it actually illuminate?" },
    ],
  },
  'poem': {
    label: "Poem",
    facets: [
      { name: "The Text or Its Gist", prompt: "What does the poem actually say, or what is it about?" },
      { name: "Imagery & Form", prompt: "What stands out about its imagery, structure, or sound?" },
      { name: "What It Resonates With", prompt: "What in your own life does this connect to?" },
    ],
  },
  'riddle': {
    label: "Riddle",
    facets: [
      { name: "The Riddle Itself", prompt: "What is the exact wording?" },
      { name: "The Answer (if known)", prompt: "What is the answer, if you know it?" },
      { name: "Why It Works", prompt: "What is the trick or logic behind it?" },
    ],
  },
  'seminar': {
    label: "Seminar",
    facets: [
      { name: "Format & Participants", prompt: "Who was involved, and how was it run?" },
      { name: "Main Threads", prompt: "What were the actual threads of discussion?" },
      { name: "Takeaways", prompt: "What are you leaving with?" },
    ],
  },
  'song/musical piece': {
    label: "Song/Musical Piece",
    facets: [
      { name: "Lyrics or Theme", prompt: "What is it actually about or saying?" },
      { name: "Musical Character", prompt: "What stands out about its mood, structure, or instrumentation?" },
      { name: "Personal Association", prompt: "Why does this particular piece matter to you?" },
    ],
  },
  'story': {
    label: "Story",
    facets: [
      { name: "What Happens", prompt: "What actually happens in the story?" },
      { name: "Characters & Stakes", prompt: "Who is involved, and what do they stand to lose or gain?" },
      { name: "What It\u2019s Really About", prompt: "What theme sits underneath the plot?" },
    ],
  },
  'video': {
    label: "Video",
    facets: [
      { name: "What It Covers", prompt: "What is the video actually about?" },
      { name: "Key Moments", prompt: "Which specific moments or timestamps are worth returning to?" },
      { name: "Your Reaction", prompt: "What was your own response to it?" },
    ],
  },
  'website': {
    label: "Website",
    facets: [
      { name: "What It\u2019s For", prompt: "What is this site actually for?" },
      { name: "How You Use It", prompt: "How do you actually engage with it?" },
      { name: "Reliability / Trust", prompt: "How much do you trust what\u2019s there, and why?" },
    ],
  },
};

// The first chosen type tag that has a template wins, checked in the
// order they were added -- so a Resource tagged both "book" and "essay"
// uses whichever you picked first, rather than whichever happens to
// come first alphabetically.
export function resourceTemplateForTags(tags = []) {
  for (const tag of tags) {
    const template = resourceTemplates[tag.trim().toLowerCase()];
    if (template) return template;
  }
  return null;
}

export const RESOURCE_TEMPLATE_TYPES = Object.keys(resourceTemplates);
