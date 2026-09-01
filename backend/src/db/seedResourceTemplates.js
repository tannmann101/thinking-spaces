// Built-in Resource Templates -- one starting set of facets per named
// Resource type, replacing CreateResource.jsx's three generic
// descriptive facets (What It Is / What It Affords / What It Offers)
// with a type-tailored set of its own. See schema.sql and
// db/queries/resourceTemplates.js for why this is a deliberately
// separate mechanism from ordinary Templates, and why the fourth,
// structural facet (Touches / Touched By) stays universal and isn't
// part of any Template's own `facets` here.
//
// All 17 types named at the person's own request, in one pass, per
// direct confirmation -- each set of facets is written specifically
// for that type, not a generic fill-in-the-blank pattern reused
// verbatim across all of them.

import { getResourceTemplateByType, createResourceTemplate } from './queries.js';

const RESOURCE_TEMPLATES = [
  {
    id: 'resource-template-book',
    type: 'book',
    label: 'Book',
    facets: [
      { name: 'Core Argument or Story', prompt: 'What is this book actually arguing, or what does it depict?' },
      { name: 'Key Passages', prompt: 'Which specific passages, scenes, or quotes are worth remembering?' },
      { name: 'Personal Notes', prompt: 'What are your own reactions or takeaways so far?' },
    ],
  },
  {
    id: 'resource-template-lecture',
    type: 'lecture',
    label: 'Lecture',
    facets: [
      { name: 'Main Claims', prompt: 'What was actually argued or taught?' },
      { name: 'Notable Moments', prompt: 'Was there a specific example, aside, or turn of phrase worth keeping?' },
      { name: 'Open Questions', prompt: 'What did it leave unresolved for you?' },
    ],
  },
  {
    id: 'resource-template-article',
    type: 'article',
    label: 'Article',
    facets: [
      { name: 'Thesis', prompt: "What is the article's central claim?" },
      { name: 'Evidence Used', prompt: 'What does it lean on to support that claim?' },
      { name: 'Your Take', prompt: 'Where do you agree or disagree, and why?' },
    ],
  },
  {
    id: 'resource-template-art-piece',
    type: 'art piece',
    label: 'Art Piece',
    facets: [
      { name: 'What It Depicts', prompt: 'What is the subject or form of the piece?' },
      { name: 'Technique or Choices', prompt: 'What formal choices stand out -- medium, composition, technique?' },
      { name: 'What It Evokes', prompt: 'What does it actually make you feel or notice?' },
    ],
  },
  {
    id: 'resource-template-lesson',
    type: 'lesson',
    label: 'Lesson',
    facets: [
      { name: 'What It Teaches', prompt: 'What is the actual skill or knowledge being taught?' },
      { name: 'How It’s Structured', prompt: 'What is the teaching approach -- steps, examples, drills?' },
      { name: 'Where You’re Stuck', prompt: 'What still feels unclear or unpracticed?' },
    ],
  },
  {
    id: 'resource-template-parable',
    type: 'parable',
    label: 'Parable',
    facets: [
      { name: 'The Story', prompt: 'What literally happens in the parable?' },
      { name: 'The Lesson', prompt: 'What is it meant to teach?' },
      { name: 'Where It Applies', prompt: 'What real situation does it actually illuminate?' },
    ],
  },
  {
    id: 'resource-template-video',
    type: 'video',
    label: 'Video',
    facets: [
      { name: 'What It Covers', prompt: 'What is the video actually about?' },
      { name: 'Key Moments', prompt: 'Which specific moments or timestamps are worth returning to?' },
      { name: 'Your Reaction', prompt: 'What was your own response to it?' },
    ],
  },
  {
    id: 'resource-template-seminar',
    type: 'seminar',
    label: 'Seminar',
    facets: [
      { name: 'Format & Participants', prompt: 'Who was involved, and how was it run?' },
      { name: 'Main Threads', prompt: 'What were the actual threads of discussion?' },
      { name: 'Takeaways', prompt: 'What are you leaving with?' },
    ],
  },
  {
    id: 'resource-template-website',
    type: 'website',
    label: 'Website',
    facets: [
      { name: 'What It’s For', prompt: 'What is this site actually for?' },
      { name: 'How You Use It', prompt: 'How do you actually engage with it?' },
      { name: 'Reliability / Trust', prompt: 'How much do you trust what’s there, and why?' },
    ],
  },
  {
    id: 'resource-template-song',
    type: 'song/musical piece',
    label: 'Song/Musical Piece',
    facets: [
      { name: 'Lyrics or Theme', prompt: 'What is it actually about or saying?' },
      { name: 'Musical Character', prompt: 'What stands out about its mood, structure, or instrumentation?' },
      { name: 'Personal Association', prompt: 'Why does this particular piece matter to you?' },
    ],
  },
  {
    id: 'resource-template-aphorism',
    type: 'aphorism',
    label: 'Aphorism',
    facets: [
      { name: 'The Saying', prompt: 'What is the exact wording?' },
      { name: 'What It Means', prompt: 'What is your own gloss on it?' },
      { name: 'When It Applies', prompt: 'When have you actually reached for this?' },
    ],
  },
  {
    id: 'resource-template-debate',
    type: 'debate',
    label: 'Debate',
    facets: [
      { name: 'Position For', prompt: 'What is the strongest case for this position?' },
      { name: 'Position Against', prompt: 'What is the strongest case against it?' },
      { name: 'Where You Land', prompt: 'Where do you actually come down, and why?' },
    ],
  },
  {
    id: 'resource-template-essay',
    type: 'essay',
    label: 'Essay',
    facets: [
      { name: 'Central Claim', prompt: "What is the essay's central claim?" },
      { name: 'Supporting Moves', prompt: 'How does the argument actually build?' },
      { name: 'Where It’s Weakest', prompt: 'Where does the argument feel least convincing?' },
    ],
  },
  {
    id: 'resource-template-film',
    type: 'film',
    label: 'Film',
    facets: [
      { name: 'Plot / Premise', prompt: 'What is the film actually about, on its surface?' },
      { name: 'Notable Scenes', prompt: 'Which specific scenes are worth remembering?' },
      { name: 'What It’s Really About', prompt: 'What theme sits underneath the plot?' },
    ],
  },
  {
    id: 'resource-template-poem',
    type: 'poem',
    label: 'Poem',
    facets: [
      { name: 'The Text or Its Gist', prompt: 'What does the poem actually say, or what is it about?' },
      { name: 'Imagery & Form', prompt: 'What stands out about its imagery, structure, or sound?' },
      { name: 'What It Resonates With', prompt: 'What in your own life does this connect to?' },
    ],
  },
  {
    id: 'resource-template-story',
    type: 'story',
    label: 'Story',
    facets: [
      { name: 'What Happens', prompt: 'What actually happens in the story?' },
      { name: 'Characters & Stakes', prompt: 'Who is involved, and what do they stand to lose or gain?' },
      { name: 'What It’s Really About', prompt: 'What theme sits underneath the plot?' },
    ],
  },
  {
    id: 'resource-template-riddle',
    type: 'riddle',
    label: 'Riddle',
    facets: [
      { name: 'The Riddle Itself', prompt: 'What is the exact wording?' },
      { name: 'The Answer (if known)', prompt: 'What is the answer, if you know it?' },
      { name: 'Why It Works', prompt: 'What is the trick or logic behind it?' },
    ],
  },
];

export function seedResourceTemplates() {
  RESOURCE_TEMPLATES.forEach(({ id, type, label, facets }) => {
    if (getResourceTemplateByType(type)) return;
    createResourceTemplate({ id, type, label, facets });
  });
}
