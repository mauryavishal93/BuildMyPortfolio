import { RESUME_WIZARD_DRAFT_KEY } from './resume-wizard-data.js';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

const blankEducation = () => ({ degree: '', institution: '', location: '', startDate: '', endDate: '', current: false, details: '' });
const blankExperience = () => ({ role: '', company: '', location: '', startDate: '', endDate: '', current: false, details: '' });
const blankProject = () => ({ name: '', link: '', date: '', details: '' });
const draft = {
  careerPath: '',
  profile: { fullName: '', headline: '', email: '', phone: '', linkedin: '', location: '' },
  summary: '',
  education: [blankEducation()],
  experience: [blankExperience()],
  skills: '',
  projects: [blankProject()],
  achievements: '',
  certifications: '',
  additional: ''
};

const fields = {
  profile: [
    { id: 'fullName', label: 'Full name', required: true, autocomplete: 'name', placeholder: 'e.g. Jordan Taylor' },
    { id: 'headline', label: 'Professional title or target role', placeholder: 'e.g. Product Designer' },
    { id: 'email', label: 'Email address', type: 'email', required: true, autocomplete: 'email', placeholder: 'you@example.com' },
    { id: 'phone', label: 'Phone number', type: 'tel', required: true, autocomplete: 'tel', placeholder: 'Your phone number' },
    { id: 'linkedin', label: 'LinkedIn profile link', placeholder: 'linkedin.com/in/yourname' },
    { id: 'location', label: 'City and country', placeholder: 'e.g. Bengaluru, India' }
  ],
  education: [
    { id: 'degree', label: 'Degree or qualification', placeholder: 'e.g. BSc Computer Science' },
    { id: 'institution', label: 'School or institution', placeholder: 'University or school name' },
    { id: 'location', label: 'Location', placeholder: 'City, country' },
    { id: 'startDate', label: 'Start date', type: 'month' },
    { id: 'endDate', label: 'End date', type: 'month' },
    { id: 'details', label: 'Relevant coursework or details', multiline: true, full: true, placeholder: 'Add honors, coursework, or academic details' }
  ],
  experience: [
    { id: 'role', label: 'Role or job title', placeholder: 'e.g. Software Engineering Intern' },
    { id: 'company', label: 'Company or organization', placeholder: 'Company name' },
    { id: 'location', label: 'Location', placeholder: 'City, country or Remote' },
    { id: 'startDate', label: 'Start date', type: 'month' },
    { id: 'endDate', label: 'End date', type: 'month' },
    { id: 'details', label: 'What did you do or accomplish?', multiline: true, full: true, placeholder: 'Use a new line for each responsibility or accomplishment' }
  ],
  projects: [
    { id: 'name', label: 'Project name', placeholder: 'e.g. Campus Planner' },
    { id: 'link', label: 'Project link (optional)', placeholder: 'https://example.com' },
    { id: 'date', label: 'Date or timeframe', placeholder: 'e.g. 2025' },
    { id: 'details', label: 'What did you build or achieve?', multiline: true, full: true, placeholder: 'Describe the project, tools used, and impact' }
  ]
};

const stepsByPath = {
  fresher: ['profile', 'summary', 'education', 'experience', 'skills', 'projects', 'extras', 'review'],
  experienced: ['profile', 'summary', 'experience', 'projects', 'education', 'skills', 'achievements', 'extras', 'review']
};
const stepInfo = {
  profile: {
    title: 'Your contact details',
    description: 'Add the details recruiters need to reach you.',
    type: 'fields',
    scope: 'profile',
    fields: fields.profile
  },
  summary: {
    title: 'Professional summary',
    description: 'A short introduction helps employers quickly understand your strengths. This is optional; you can also write it in the editor.',
    type: 'textarea',
    scope: 'summary',
    field: 'summary',
    label: 'Summary or career objective',
    placeholder: 'Write 2–4 sentences about your goals, strengths, and experience.'
  },
  education: {
    title: 'Education',
    description: 'Add your most relevant education first. You can include more than one entry.',
    type: 'entries',
    scope: 'education',
    label: 'Education'
  },
  experience: {
    title: 'Internship and experience',
    description: 'Add internships, placements, volunteering, or work experience. Entries are optional.',
    type: 'entries',
    scope: 'experience',
    label: 'Experience'
  },
  projects: {
    title: 'Projects',
    description: 'Showcase projects that demonstrate your skills and the impact of your work.',
    type: 'entries',
    scope: 'projects',
    label: 'Project'
  },
  skills: {
    title: 'Skills',
    description: 'Add technical and professional skills, separated by commas or new lines.',
    type: 'textarea',
    scope: 'skills',
    field: 'skills',
    label: 'Skills',
    placeholder: 'e.g. JavaScript, customer research, project management'
  },
  achievements: {
    title: 'Achievements',
    description: 'Add awards, promotions, measurable results, or other accomplishments.',
    type: 'textarea',
    scope: 'achievements',
    field: 'achievements',
    label: 'Achievements',
    placeholder: 'Add one achievement per line.'
  },
  extras: {
    title: 'Certifications and more',
    description: 'Add certifications, languages, volunteering, or other relevant details. These fields are optional.',
    type: 'extras'
  },
  review: {
    title: 'Review your details',
    description: 'Check the information below. You can go back to any step before creating your resume.',
    type: 'review'
  }
};

function stepTitle(stepId) {
  if (stepId === 'experience' && draft.careerPath === 'experienced') return 'Work experience';
  return stepInfo[stepId].title;
}

function stepDescription(stepId) {
  if (stepId === 'experience' && draft.careerPath === 'experienced') {
    return 'Add your most recent roles first, including dates, responsibilities, and achievements.';
  }
  return stepInfo[stepId].description;
}

function renderField(field, value, scope, index = null) {
  const id = `wizard-${scope}-${index === null ? '' : `${index}-`}${field.id}`;
  const attributes = `data-scope="${scope}" data-field="${field.id}"${index === null ? '' : ` data-index="${index}"`}`;
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const autocomplete = field.autocomplete ? ` autocomplete="${field.autocomplete}"` : '';
  const label = `${escapeHtml(field.label)}${field.required ? ' <span class="wizard-required" aria-hidden="true">*</span>' : ''}`;
  const control = field.multiline
    ? `<textarea id="${id}" ${attributes}${required}${placeholder} maxlength="2000">${escapeHtml(value)}</textarea>`
    : `<input id="${id}" type="${field.type || 'text'}" ${attributes}${required}${placeholder}${autocomplete} maxlength="180" value="${escapeHtml(value)}">`;
  return `<div class="wizard-field${field.full ? ' wizard-field-full' : ''}"><label for="${id}">${label}</label>${control}</div>`;
}

function renderFields(step) {
  return `<div class="wizard-field-grid">${step.fields.map(field => renderField(field, draft[step.scope][field.id], step.scope)).join('')}</div>`;
}

function renderTextarea(step) {
  const field = { id: step.field, label: step.label, multiline: true, full: true, placeholder: step.placeholder };
  return `<div class="wizard-field-grid">${renderField(field, draft[step.scope], step.scope)}</div>`;
}

function renderEntries(step) {
  const currentEntries = draft[step.scope];
  const emptyFactory = step.scope === 'education' ? blankEducation : step.scope === 'projects' ? blankProject : blankExperience;
  const entryFields = fields[step.scope];
  const entries = currentEntries.length
    ? `<div class="wizard-entry-list">${currentEntries.map((entry, index) => {
      const currentCheckbox = step.scope === 'education' || step.scope === 'experience'
        ? `<label class="wizard-current-field"><input type="checkbox" data-scope="${step.scope}" data-index="${index}" data-field="current"${entry.current ? ' checked' : ''}> This is my current ${step.scope === 'education' ? 'program' : 'role'}</label>`
        : '';
      const groupLabelId = `wizard-${step.scope}-group-${index}`;
      return `<div class="wizard-entry-card" role="group" aria-labelledby="${groupLabelId}"><div class="wizard-entry-heading"><strong id="${groupLabelId}">${escapeHtml(step.label)} ${index + 1}</strong><button class="wizard-remove-entry" type="button" data-remove-entry="${step.scope}" data-index="${index}" aria-label="Remove ${step.label.toLowerCase()} ${index + 1}">Remove</button></div><div class="wizard-field-grid">${entryFields.map(field => renderField(field, entry[field.id], step.scope, index)).join('')}${currentCheckbox}</div></div>`;
    }).join('')}</div>`
    : `<p class="wizard-empty-entries">No entries added yet. Add one if it belongs on your resume.</p>`;
  return `${entries}<button class="wizard-add-entry" type="button" data-add-entry="${step.scope}">＋ Add ${step.label.toLowerCase()}</button>`;
}

function reviewText(value, fallback = 'Not added') {
  return escapeHtml(String(value || '').trim() || fallback).replace(/\r?\n/g, '<br>');
}

function renderReview() {
  const profile = draft.profile;
  const sections = [
    `<section class="wizard-review-section"><h3>Contact details</h3><p>${reviewText(profile.fullName)} · ${reviewText(profile.email)} · ${reviewText(profile.phone)}</p><p>${reviewText(profile.linkedin, 'LinkedIn not added')}${profile.location ? ` · ${escapeHtml(profile.location)}` : ''}</p></section>`,
    `<section class="wizard-review-section"><h3>Professional summary</h3><p>${reviewText(draft.summary)}</p></section>`
  ];
  const entrySections = [
    ['education', 'Education', 'degree', 'institution'],
    ['experience', draft.careerPath === 'fresher' ? 'Internship & experience' : 'Work experience', 'role', 'company'],
    ['projects', 'Projects', 'name', 'link']
  ];
  for (const [scope, title, primary, secondary] of entrySections) {
    const entries = draft[scope].filter(entry => Object.values(entry).some(value => value && value !== false));
    if (!entries.length) continue;
    sections.push(`<section class="wizard-review-section"><h3>${title}</h3>${entries.map(entry => `<p class="wizard-review-entry"><strong>${reviewText(entry[primary])}</strong><span>${reviewText(entry[secondary], '')}${entry.startDate || entry.date ? ` · ${escapeHtml([entry.startDate, entry.current ? 'Present' : entry.endDate].filter(Boolean).join(' — ') || entry.date)}` : ''}</span>${entry.details ? `<span>${reviewText(entry.details)}</span>` : ''}</p>`).join('')}</section>`);
  }
  for (const [scope, title] of [['skills', 'Skills'], ['achievements', 'Achievements'], ['certifications', 'Certifications'], ['additional', 'Additional information']]) {
    if (!draft[scope].trim()) continue;
    sections.push(`<section class="wizard-review-section"><h3>${title}</h3><p>${reviewText(draft[scope])}</p></section>`);
  }
  return `<div class="wizard-review">${sections.join('')}</div>`;
}

function renderPathChoice() {
  return `<div>
    <h2 class="wizard-step-title" tabindex="-1">Where are you in your career?</h2>
    <p class="wizard-step-description">We’ll tailor the next steps to the resume you need.</p>
    <div class="wizard-path-options">
      <button class="wizard-path-card" type="button" data-select-path="fresher">
        <span class="wizard-path-icon" aria-hidden="true">✦</span>
        <strong>I'm a fresher</strong>
        <span>For students, recent graduates, and people starting their careers.</span>
      </button>
      <button class="wizard-path-card" type="button" data-select-path="experienced">
        <span class="wizard-path-icon" aria-hidden="true">↗</span>
        <strong>I'm experienced</strong>
        <span>For professionals with work experience and career achievements.</span>
      </button>
    </div>
  </div>`;
}

let stepIndex = -1;
const root = $('wizardStepContent');
const previousButton = $('wizardPrevious');
const nextButton = $('wizardNext');
const returnLink = $('wizardReturn');
const progress = $('wizardProgress');
const title = $('wizardTitle');
const description = $('wizardDescription');
const status = $('wizardStatus');

function steps() {
  return stepsByPath[draft.careerPath] || [];
}

function captureForm() {
  for (const control of root.querySelectorAll('[data-scope][data-field]')) {
    const { scope, field, index } = control.dataset;
    const value = control.type === 'checkbox' ? control.checked : control.value;
    if (scope === 'profile') draft.profile[field] = value;
    else if (Array.isArray(draft[scope])) draft[scope][Number(index)][field] = value;
    else draft[scope] = value;
  }
}

function render() {
  status.textContent = '';
  const pathChosen = Boolean(draft.careerPath);
  returnLink.hidden = !pathChosen;
  previousButton.hidden = !pathChosen;
  nextButton.hidden = !pathChosen;
  progress.hidden = !pathChosen;
  if (!pathChosen) {
    title.textContent = 'Build your resume from scratch';
    description.textContent = 'Choose your experience level and we’ll guide you through the right details.';
    root.innerHTML = renderPathChoice();
    return;
  }

  const pathSteps = steps();
  stepIndex = Math.max(0, Math.min(stepIndex, pathSteps.length - 1));
  const id = pathSteps[stepIndex];
  const step = stepInfo[id];
  const heading = stepTitle(id);
  const instructions = stepDescription(id);
  title.textContent = `${draft.careerPath === 'fresher' ? 'Fresher' : 'Experienced'} resume`;
  description.textContent = 'Your details are copied into the editor only when you create your resume.';
  $('wizardStepLabel').textContent = heading;
  $('wizardStepCount').textContent = `Step ${stepIndex + 1} of ${pathSteps.length}`;
  const percentage = Math.round(((stepIndex + 1) / pathSteps.length) * 100);
  $('wizardProgressBar').setAttribute('aria-valuenow', String(percentage));
  $('wizardProgressFill').style.width = `${percentage}%`;
  previousButton.textContent = stepIndex === 0 ? 'Change level' : 'Previous';
  nextButton.textContent = id === 'review' ? 'Create my resume' : 'Continue';

  if (step.type === 'review') {
    root.innerHTML = `<div><h2 class="wizard-step-title" tabindex="-1">${heading}</h2><p class="wizard-step-description">${instructions}</p>${renderReview()}</div>`;
  } else if (step.type === 'fields') {
    root.innerHTML = `<form class="wizard-form" novalidate><div><h2 class="wizard-step-title" tabindex="-1">${heading}</h2><p class="wizard-step-description">${instructions}</p></div>${renderFields(step)}<button class="wizard-form-submit" type="submit" tabindex="-1" aria-hidden="true">Continue</button></form>`;
  } else if (step.type === 'textarea') {
    root.innerHTML = `<form class="wizard-form" novalidate><div><h2 class="wizard-step-title" tabindex="-1">${heading}</h2><p class="wizard-step-description">${instructions}</p></div>${renderTextarea(step)}<button class="wizard-form-submit" type="submit" tabindex="-1" aria-hidden="true">Continue</button></form>`;
  } else if (step.type === 'entries') {
    root.innerHTML = `<form class="wizard-form" novalidate><div><h2 class="wizard-step-title" tabindex="-1">${heading}</h2><p class="wizard-step-description">${instructions}</p></div>${renderEntries(step)}<button class="wizard-form-submit" type="submit" tabindex="-1" aria-hidden="true">Continue</button></form>`;
  } else {
    root.innerHTML = `<form class="wizard-form" novalidate><div><h2 class="wizard-step-title" tabindex="-1">${heading}</h2><p class="wizard-step-description">${instructions}</p></div><div class="wizard-field-grid">${renderField({ id: 'certifications', label: 'Certifications', multiline: true, full: true, placeholder: 'Add one certification per line.' }, draft.certifications, 'certifications')}${renderField({ id: 'additional', label: 'Languages, volunteering, or other details', multiline: true, full: true, placeholder: 'Add any other relevant details.' }, draft.additional, 'additional')}</div><button class="wizard-form-submit" type="submit" tabindex="-1" aria-hidden="true">Continue</button></form>`;
  }
  root.querySelector('.wizard-step-title')?.focus({ preventScroll: true });
}

function goPrevious() {
  captureForm();
  if (stepIndex <= 0) {
    draft.careerPath = '';
    stepIndex = -1;
  } else {
    stepIndex -= 1;
  }
  render();
}

function validateCurrentStep() {
  const form = root.querySelector('form');
  if (!form) return true;
  if (form.checkValidity()) return true;
  form.reportValidity();
  status.textContent = 'Please check the highlighted fields before continuing.';
  return false;
}

function createResume() {
  nextButton.disabled = true;
  status.textContent = 'Preparing your resume…';
  try {
    sessionStorage.setItem(RESUME_WIZARD_DRAFT_KEY, JSON.stringify(draft));
    window.location.assign('/editor.html?newResume=1');
  } catch (error) {
    console.error('Could not hand off the resume wizard draft to the editor.', error);
    status.textContent = 'Your browser could not pass these details to the editor. Check that browser storage is enabled and try again.';
    nextButton.disabled = false;
  }
}

function goNext() {
  captureForm();
  if (!validateCurrentStep()) return;
  if (stepIndex >= steps().length - 1) {
    createResume();
    return;
  }
  stepIndex += 1;
  render();
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

root.addEventListener('click', event => {
  const pathButton = event.target.closest('[data-select-path]');
  if (pathButton) {
    draft.careerPath = pathButton.dataset.selectPath;
    stepIndex = 0;
    render();
    return;
  }

  const addButton = event.target.closest('[data-add-entry]');
  if (addButton) {
    captureForm();
    const factory = addButton.dataset.addEntry === 'education' ? blankEducation
      : addButton.dataset.addEntry === 'projects' ? blankProject
        : blankExperience;
    draft[addButton.dataset.addEntry].push(factory());
    render();
    root.querySelector(`[data-scope="${addButton.dataset.addEntry}"][data-index="${draft[addButton.dataset.addEntry].length - 1}"]`)?.focus();
    return;
  }

  const removeButton = event.target.closest('[data-remove-entry]');
  if (removeButton) {
    captureForm();
    draft[removeButton.dataset.removeEntry].splice(Number(removeButton.dataset.index), 1);
    render();
  }
});

root.addEventListener('submit', event => {
  if (!event.target.matches('form')) return;
  event.preventDefault();
  goNext();
});
previousButton.addEventListener('click', goPrevious);
nextButton.addEventListener('click', goNext);
returnLink.addEventListener('click', event => {
  event.preventDefault();
  captureForm();
  draft.careerPath = '';
  stepIndex = -1;
  render();
});
render();
