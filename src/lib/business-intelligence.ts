export const GUMROAD_URL = 'https://opportunityatlas.gumroad.com/l/ojthrs?wanted=true';

export const researchFields = [
  'Business identity',
  'Official website',
  'Public phone',
  'Sunbiz officer and title',
  'License status',
  'Review activity and velocity',
  'Website platform',
  'Chat and online booking',
  'Intake mode and form depth',
  'Mobile usability and broken pages',
  'Service-area and local SEO signals',
  'Crew, location, financing, and hiring signals',
  'Commercial and high-ticket signals',
  'Primary business-development gap',
  'Best outreach channel and suggested opener',
  'Verification sources',
];

export interface SampleBusiness {
  business: string;
  industry: string;
  city: string;
  licenseStatus: string;
  reviewSignal: string;
  primaryGap: string;
  intakeMode: string;
  bestOutreachChannel: string;
  officer: string;
  officerTitle: string;
  websitePlatform: string;
  onlineBooking: string;
  chat: string;
  reviewVelocity: string;
  serviceAreaPages: string;
  seoSignal: string;
  commercialWork: string;
  hiringSignal: string;
  suggestedFirstSentence: string;
  verificationSources: string[];
}

// Public-source sample records drawn from the Polk rows in the current master dataset.
// Keep this deliberately small: the site demonstrates the research structure without
// publishing the paid product.
export const sampleBusinesses: SampleBusiness[] = [
  {
    business: 'Landscape Rehab',
    industry: 'Landscape design & installation',
    city: 'Winter Haven',
    licenseStatus: 'Not attempted',
    reviewSignal: '4.8 · 52 reviews; recent velocity not verified',
    primaryGap: 'Website presence and conversion path',
    intakeMode: 'Phone-first / business line',
    bestOutreachChannel: 'Phone',
    officer: 'Unable to verify',
    officerTitle: 'Owner / landscape designer; Sunbiz title not separately confirmed',
    websitePlatform: 'Unable to verify',
    onlineBooking: 'No direct booking observed; contact or quote path present',
    chat: 'Unable to verify',
    reviewVelocity: 'Meaningful historical volume; recent velocity not verified',
    serviceAreaPages: 'Not found after search',
    seoSignal: 'Unable to verify',
    commercialWork: 'Yes',
    hiringSignal: 'Unable to verify',
    suggestedFirstSentence: 'I was looking at Landscape Rehab’s public web presence and noticed the site and conversion path may be leaving room for improvement.',
    verificationSources: ['https://landscaperehabsf.com/'],
  },
  {
    business: 'Tradition Central Air, Inc.',
    industry: 'HVAC',
    city: 'Winter Haven',
    licenseStatus: 'Unable to verify current status',
    reviewSignal: '2.6 · 5 reviews; recent velocity not verified',
    primaryGap: 'Lead follow-up and CRM workflow',
    intakeMode: 'Web form + phone',
    bestOutreachChannel: 'Phone',
    officer: 'Unable to verify',
    officerTitle: 'Unable to verify',
    websitePlatform: 'Unable to verify',
    onlineBooking: 'No direct booking observed; contact or quote path present',
    chat: 'Unable to verify',
    reviewVelocity: 'Unable to verify',
    serviceAreaPages: 'Visible service-area coverage',
    seoSignal: 'Unable to verify',
    commercialWork: 'Yes',
    hiringSignal: 'Unable to verify',
    suggestedFirstSentence: 'I noticed you already generate inbound demand; the opportunity may be in what happens after the lead comes in rather than rebuilding the front end.',
    verificationSources: ['https://traditionair.com/contact-us/'],
  },
  {
    business: 'CH Evans Roofing',
    industry: 'Roofing',
    city: 'Winter Haven',
    licenseStatus: 'Unable to verify current status',
    reviewSignal: '4.9 · 117 reviews; recent velocity not verified',
    primaryGap: 'Lead follow-up and CRM workflow',
    intakeMode: 'Web form + phone',
    bestOutreachChannel: 'Phone',
    officer: 'Unable to verify',
    officerTitle: 'Unable to verify',
    websitePlatform: 'Unable to verify',
    onlineBooking: 'No direct booking observed; contact or quote path present',
    chat: 'Unable to verify',
    reviewVelocity: 'High historical volume; recent velocity not verified',
    serviceAreaPages: 'Not found after search',
    seoSignal: 'Unable to verify',
    commercialWork: 'Yes',
    hiringSignal: 'Unable to verify',
    suggestedFirstSentence: 'I noticed you already generate inbound demand; the opportunity may be in what happens after the lead comes in rather than rebuilding the front end.',
    verificationSources: ['https://chevansroofingfl.com/'],
  },
  {
    business: 'Rupertan',
    industry: 'Landscaping, hardscaping & irrigation',
    city: 'Winter Haven',
    licenseStatus: 'Unable to verify current status',
    reviewSignal: '5.0 · 2 reviews; recent velocity not verified',
    primaryGap: 'Lead follow-up and CRM workflow',
    intakeMode: 'Web form + phone',
    bestOutreachChannel: 'Phone',
    officer: 'Jesus Gonzalez; Sunbiz officer status not separately confirmed',
    officerTitle: 'Founder; Sunbiz title not separately confirmed',
    websitePlatform: 'Unable to verify',
    onlineBooking: 'No direct booking observed; contact or quote path present',
    chat: 'Unable to verify',
    reviewVelocity: 'Unable to verify',
    serviceAreaPages: 'Visible service-area coverage',
    seoSignal: 'Unable to verify',
    commercialWork: 'Yes',
    hiringSignal: 'Unable to verify',
    suggestedFirstSentence: 'I noticed you already generate inbound demand; the opportunity may be in what happens after the lead comes in rather than rebuilding the front end.',
    verificationSources: ['https://rupertan.com/', 'https://rupertan.com/landscaper-company-winterhaven-fl/'],
  },
  {
    business: 'Honest Plumbing, Air Conditioning and Electric LLC',
    industry: 'Plumbing, HVAC & electrical',
    city: 'Winter Haven',
    licenseStatus: 'Unable to verify current status',
    reviewSignal: '3.7 · 3 reviews; recent velocity not verified',
    primaryGap: 'No strong pitch until a new gap is verified',
    intakeMode: 'Online booking + phone',
    bestOutreachChannel: 'Phone',
    officer: 'Unable to verify',
    officerTitle: 'Family-owned, third-generation contractors; Sunbiz title not separately confirmed',
    websitePlatform: 'Unable to verify',
    onlineBooking: 'Yes',
    chat: 'Unable to verify',
    reviewVelocity: 'Unable to verify',
    serviceAreaPages: 'Not found after search',
    seoSignal: 'Unable to verify',
    commercialWork: 'Not found after search',
    hiringSignal: 'Not found after search',
    suggestedFirstSentence: 'Not ready for outreach — verify a primary gap first.',
    verificationSources: ['https://honestpace.com/', 'https://honestpace.com/about-us/'],
  },
];

export const insights = [
  {
    href: '/business-intelligence/insights/find-businesses-that-need-web-design',
    label: 'Web design prospecting',
    title: 'How to Find Local Businesses That May Need a Better Website',
    description: 'Use conversion, mobile, intake, and service-area signals to prioritize research without assuming every old site needs a rebuild.',
  },
  {
    href: '/business-intelligence/insights/find-local-seo-clients',
    label: 'Local SEO prospecting',
    title: 'How SEO Agencies Can Find Better Local Prospecting Opportunities',
    description: 'A practical framework for evaluating city targeting, reviews, NAP consistency, GBP completeness, and local visibility.',
  },
  {
    href: '/business-intelligence/insights/build-local-business-prospecting-list',
    label: 'Prospect research',
    title: 'How to Build a Local Business Prospecting List Without Starting From Scratch',
    description: 'Move from raw discovery to verified, qualified, outreach-ready business research in five disciplined stages.',
  },
];
