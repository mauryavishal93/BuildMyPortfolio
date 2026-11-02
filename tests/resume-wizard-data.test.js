import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createResumeDraftFromWizard } from '../frontend/src/resume-wizard-data.js';

const makeId = (() => {
  let id = 0;
  return () => `section-${++id}`;
})();

test('fresher wizard details become an ordered editor resume with repeated entries', () => {
  const resume = createResumeDraftFromWizard({
    careerPath: 'fresher',
    profile: {
      fullName: '  Avery Student  ',
      email: 'avery@example.com',
      phone: '+1 555 0100',
      linkedin: 'https://linkedin.com/in/avery',
      location: 'Toronto',
      headline: 'Computer Science Graduate'
    },
    summary: 'Recent graduate interested in frontend engineering.',
    education: [
      { degree: 'BSc Computer Science', institution: 'Example University', startDate: '2021-09', endDate: '2025-05' }
    ],
    experience: [
      { role: 'Software Intern', company: 'Example Co.', startDate: '2024-05', endDate: '2024-08', details: 'Built an internal dashboard.' }
    ],
    skills: ['JavaScript', 'React', 'Accessibility'],
    projects: [{ name: 'Campus Planner', date: '2025', details: 'Built a student scheduling app.' }],
    certifications: ['Web Accessibility Basics'],
    achievements: 'Hackathon finalist',
    additional: 'Languages: English'
  }, makeId);

  assert.equal(resume.docName, 'Avery Student Resume');
  assert.equal(resume.profile.website, 'https://linkedin.com/in/avery');
  assert.deepEqual(resume.sections.map(section => section.title), [
    'Professional Summary',
    'Education',
    'Internship & Experience',
    'Skills',
    'Projects',
    'Certifications',
    'Achievements',
    'Additional Information'
  ]);
  assert.deepEqual(resume.sections[1].entries[0], {
    role: 'BSc Computer Science',
    company: 'Example University',
    date: '2021-09 — 2025-05',
    details: ''
  });
  assert.equal(resume.sections[2].entries[0].details, 'Built an internal dashboard.');
  assert.equal(resume.sections[3].content, 'JavaScript, React, Accessibility');
  assert.equal(resume.sections.at(-1).content, 'Languages: English');
});

test('experienced wizard details retain multiple work and project entries', () => {
  const resume = createResumeDraftFromWizard({
    careerPath: 'experienced',
    profile: { fullName: 'Jordan Engineer', email: 'jordan@example.com', phone: '555-0188' },
    experience: [
      { role: 'Senior Engineer', company: 'Northstar', startDate: '2022-01', current: true, details: 'Led platform work.' },
      { role: 'Engineer', company: 'Contoso', startDate: '2019-01', endDate: '2021-12', details: 'Shipped product features.' }
    ],
    projects: [
      { name: 'Developer Platform', link: 'https://example.com', date: '2024', details: 'Improved deployment workflows.' },
      { name: 'Observability Toolkit', date: '2023', details: 'Unified service monitoring.' }
    ],
    education: [{ degree: 'BSc Software Engineering', institution: 'State University' }],
    skills: 'Java, SQL\nCloud infrastructure',
    achievements: 'Promoted to senior engineer'
  }, makeId);

  assert.deepEqual(resume.sections.map(section => section.title), [
    'Work Experience',
    'Skills',
    'Projects',
    'Education',
    'Achievements'
  ]);
  assert.equal(resume.sections[0].entries.length, 2);
  assert.equal(resume.sections[0].entries[0].date, '2022-01 — Present');
  assert.equal(resume.sections[2].entries.length, 2);
  assert.equal(resume.sections[2].entries[0].company, 'https://example.com');
  assert.equal(resume.sections[1].content, 'Java, SQL, Cloud infrastructure');
});

test('wizard draft requires a selected path and core contact details', () => {
  assert.throws(() => createResumeDraftFromWizard({ careerPath: 'student', profile: {} }), /Choose fresher or experienced/);
  assert.throws(() => createResumeDraftFromWizard({
    careerPath: 'fresher',
    profile: { fullName: 'Avery', email: 'avery@example.com' }
  }), /phone number/);
});

test('wizard entry points are wired to the editor draft handoff', () => {
  const wizardHtml = readFileSync(new URL('../frontend/resume-wizard.html', import.meta.url), 'utf8');
  const wizardScript = readFileSync(new URL('../frontend/src/resume-wizard.js', import.meta.url), 'utf8');
  const editorScript = readFileSync(new URL('../frontend/src/main.js', import.meta.url), 'utf8');

  assert.match(wizardHtml, /id="wizardStepContent"/);
  assert.match(wizardHtml, /src="\/src\/resume-wizard\.js"/);
  assert.match(wizardScript, /fresher: \['profile', 'summary', 'education', 'experience', 'skills', 'projects', 'extras', 'review'\]/);
  assert.match(wizardScript, /experienced: \['profile', 'summary', 'experience', 'projects', 'education', 'skills', 'achievements', 'extras', 'review'\]/);
  assert.match(wizardScript, /data-add-entry/);
  assert.match(wizardScript, /sessionStorage\.setItem\(RESUME_WIZARD_DRAFT_KEY/);
  assert.match(editorScript, /createResumeDraftFromWizard\(JSON\.parse\(serializedDraft\)\)/);
  assert.match(editorScript, /wizardResumeDraftPending\s*\?\s*\{type:'migrate-guest-copy'\}/);
});
