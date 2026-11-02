export const RESUME_WIZARD_DRAFT_KEY = 'personaCraftResumeWizardDraftV1';

const asText = value => typeof value === 'string' ? value.trim() : '';
const entriesFrom = value => Array.isArray(value) ? value.filter(entry => entry && typeof entry === 'object') : [];

function dateRange(entry) {
  const start = asText(entry.startDate);
  const end = entry.current ? 'Present' : asText(entry.endDate);
  return [start, end].filter(Boolean).join(' — ');
}

function makeSection(id, type, title, content, entries = null, listStyle = 'bullet') {
  if (entries) return { id, type, title, visible: true, listStyle, entries };
  return { id, type, title, visible: true, listStyle, content };
}

export function createResumeDraftFromWizard(draft, makeId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10)) {
  if (!draft || !['fresher', 'experienced'].includes(draft.careerPath)) {
    throw new Error('Choose fresher or experienced to build a resume.');
  }

  const profile = draft.profile && typeof draft.profile === 'object' ? draft.profile : {};
  const name = asText(profile.fullName);
  const email = asText(profile.email);
  const phone = asText(profile.phone);
  if (!name || !email || !phone) {
    throw new Error('Add your name, email address, and phone number before creating your resume.');
  }

  const education = entriesFrom(draft.education).map(entry => ({
    role: asText(entry.degree),
    company: [asText(entry.institution), asText(entry.location)].filter(Boolean).join(' · '),
    date: dateRange(entry),
    details: asText(entry.details)
  })).filter(entry => entry.role || entry.company || entry.date || entry.details);

  const experience = entriesFrom(draft.experience).map(entry => ({
    role: asText(entry.role),
    company: [asText(entry.company), asText(entry.location)].filter(Boolean).join(' · '),
    date: dateRange(entry),
    details: asText(entry.details)
  })).filter(entry => entry.role || entry.company || entry.date || entry.details);

  const projects = entriesFrom(draft.projects).map(entry => ({
    role: asText(entry.name),
    company: asText(entry.link),
    date: asText(entry.date),
    details: asText(entry.details)
  })).filter(entry => entry.role || entry.company || entry.date || entry.details);

  const skills = Array.isArray(draft.skills)
    ? draft.skills.map(asText).filter(Boolean).join(', ')
    : asText(draft.skills).split(/[,\n]/).map(asText).filter(Boolean).join(', ');
  const sections = [];
  const summary = asText(draft.summary);
  if (summary) sections.push(makeSection(makeId(), 'summary', 'Professional Summary', summary, null, 'none'));

  if (draft.careerPath === 'fresher') {
    if (education.length) sections.push(makeSection(makeId(), 'education', 'Education', '', education));
    if (experience.length) sections.push(makeSection(makeId(), 'experience', 'Internship & Experience', '', experience));
    if (skills) sections.push(makeSection(makeId(), 'skills', 'Skills', skills));
    if (projects.length) sections.push(makeSection(makeId(), 'projects', 'Projects', '', projects));
  } else {
    if (experience.length) sections.push(makeSection(makeId(), 'experience', 'Work Experience', '', experience));
    if (skills) sections.push(makeSection(makeId(), 'skills', 'Skills', skills));
    if (projects.length) sections.push(makeSection(makeId(), 'projects', 'Projects', '', projects));
    if (education.length) sections.push(makeSection(makeId(), 'education', 'Education', '', education));
  }

  const certifications = Array.isArray(draft.certifications)
    ? draft.certifications.map(asText).filter(Boolean)
    : asText(draft.certifications).split(/\r?\n/).map(asText).filter(Boolean);
  if (certifications.length) {
    sections.push(makeSection(makeId(), 'certifications', 'Certifications', certifications.join('\n')));
  }
  const achievements = asText(draft.achievements);
  if (achievements) sections.push(makeSection(makeId(), 'custom', 'Achievements', achievements));
  const additional = asText(draft.additional);
  if (additional) sections.push(makeSection(makeId(), 'custom', 'Additional Information', additional));

  return {
    version: 4,
    docName: `${name} Resume`.slice(0, 120),
    template: 'classic',
    layout: 'single',
    mode: 'flow',
    profile: {
      name,
      headline: asText(profile.headline) || (draft.careerPath === 'fresher' ? 'Recent Graduate' : 'Professional'),
      email,
      phone,
      location: asText(profile.location),
      website: asText(profile.linkedin),
      photo: ''
    },
    design: {
      accent: '#31547a',
      font: 'Arial',
      fontSize: 12,
      headingSize: 15,
      margin: 32,
      marginY: 32,
      pageNumbers: true,
      headerAlign: '',
      photoAlign: ''
    },
    sections,
    positions: {},
    importedSourceText: ''
  };
}
