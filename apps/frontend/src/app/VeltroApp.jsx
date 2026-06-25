'use client';
import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';

// ─── LOCALE CONFIG ────────────────────────────────────────────────────────────
const SUPPORTED_LOCALES = [
  'en','fr','ar','zh','sw',        // Tier 1 — embedded, zero latency
  'pt','es','de','ru','ja',        // Tier 2 — dynamic via /api/i18n
  'ko','tr','vi','nl','it',
  'hi','ha','yo','ig','am',
  'rw','mg',
];

const LOCALE_META = {
  en:{name:'English',flag:'🇬🇧'},fr:{name:'Français',flag:'🇫🇷'},ar:{name:'العربية',flag:'🇸🇦'},
  zh:{name:'中文',flag:'🇨🇳'},sw:{name:'Kiswahili',flag:'🇹🇿'},pt:{name:'Português',flag:'🇧🇷'},
  es:{name:'Español',flag:'🇪🇸'},de:{name:'Deutsch',flag:'🇩🇪'},ru:{name:'Русский',flag:'🇷🇺'},
  ja:{name:'日本語',flag:'🇯🇵'},ko:{name:'한국어',flag:'🇰🇷'},tr:{name:'Türkçe',flag:'🇹🇷'},
  vi:{name:'Tiếng Việt',flag:'🇻🇳'},nl:{name:'Nederlands',flag:'🇳🇱'},it:{name:'Italiano',flag:'🇮🇹'},
  hi:{name:'हिन्दी',flag:'🇮🇳'},ha:{name:'Hausa',flag:'🇳🇬'},yo:{name:'Yorùbá',flag:'🇳🇬'},
  ig:{name:'Igbo',flag:'🇳🇬'},am:{name:'አማርኛ',flag:'🇪🇹'},rw:{name:'Kinyarwanda',flag:'🇷🇼'},
  mg:{name:'Malagasy',flag:'🇲🇬'},
};

const RTL_LOCALES = new Set(['ar']);
const TIER1 = new Set(['en','fr','ar','zh','sw']);

// ─── TIER 1: EMBEDDED TRANSLATIONS ───────────────────────────────────────────
const EN = {
  nav_pricing:'Pricing',nav_login:'Log in',nav_signup:'Start free',nav_dashboard:'Dashboard',
  hero_headline:'What should you do today to generate the most revenue from search?',
  hero_sub:'Veltro answers that question every week — with working code, not reports.',
  hero_cta:'Start free — 7 days',hero_demo:'See how it works',
  how_title:'How it works',
  how_s1:'1. Enter your URL',how_s1d:'Veltro auto-detects your technology — Next.js, WordPress, Webflow, and 7 more.',
  how_s2:'2. Connect your data',how_s2d:'Link GSC + GA4 to replace estimates with your real revenue numbers.',
  how_s3:'3. Choose your plan',how_s3d:'Your first SEO analysis runs immediately. Delivered by WhatsApp + email.',
  how_s4:'4. Every week, automatically',how_s4d:'Veltro finds opportunities, generates pages, delivers. You deploy in 30 minutes.',
  stacks_title:'Works with any technology',
  pricing_title:'Simple, growth-focused pricing',
  pricing_sub:'7-day free trial on all plans. No credit card required.',
  pricing_monthly:'Monthly',pricing_annual:'Annual (save 17%)',pricing_lifetime:'Lifetime',
  pricing_mo:'/mo',pricing_yr:'/yr',pricing_cta:'Start free',pricing_popular:'Most popular',
  pay_title:'All payment methods accepted',
  onboard_title:'Set up Veltro',
  onboard_steps:'Account|Website|Your business|Search Console|Analytics|Plan|Ready',
  account_title:'Create your account',name_label:'Your name',email_label:'Email',
  password_label:'Password',phone_label:'Phone (for WhatsApp delivery)',
  phone_hint:'Include country code: +237600000000',country_label:'Country',lang_label:'Language',
  domain_title:'What is your website URL?',domain_label:'Website URL',domain_hint:'e.g. whisperience.com',
  detecting:'Detecting your technology…',
  stack_detected:'{{stack}} detected ({{confidence}}% confidence)',
  stack_low:'Technology not detected — universal HTML format will be used',
  stack_title:'Tell us about your business',biz_type_label:'Business type',
  biz_type_hint:'e.g. B2B SaaS, E-commerce, Agency',revenue_goal:'Monthly revenue goal ($)',
  aov_label:'Average order value ($)',keywords_label:'Seed keywords (1–20)',
  keywords_hint:'Type a keyword, press Enter.',
  gsc_title:'Connect Google Search Console',
  gsc_desc:'Unlocks real click and ranking data — turning revenue estimates from approximate to exact.',
  gsc_cta:'Connect with Google',gsc_skip:'Skip for now (estimates will be approximate)',
  ga4_title:'Select your GA4 property',
  ga4_desc:'Veltro uses GA4 to measure actual conversion rates and revenue per page.',
  ga4_property:'GA4 Property ID',ga4_hint:'GA4 → Admin → Property Settings → Property ID',
  ga4_skip:'Skip (use industry benchmarks)',plan_title:'Choose your plan',pay_method:'Payment method',
  done_title:"You're all set",
  done_desc:'Your first SEO analysis is running. Results by email{{wa}} within 10 minutes.',
  done_wa:' and WhatsApp',done_cta:'Go to dashboard',
  dash_title:'Revenue Dashboard',dash_upside:'Total Annual Upside',dash_quickwin:'Quick Win (Top 3)',
  dash_found:'Actions Found',dash_auto:'Auto-Deployable',dash_all:'All',dash_autotab:'Auto-deploy',
  dash_manual:'Manual',dash_annual:'Annual Gain',dash_monthly:'Monthly',dash_effort:'Effort',
  dash_evidence:'Data Points',dash_implement:'Implementation',
  dash_deploy:'⚡ Auto-Deploy Now',dash_download:'Download Fix ZIP',
  footer_copy:'© 2026 Veltro',next:'Next',back:'Back',skip:'Skip',
};

const EMBEDDED = {
  en: EN,
  fr: {...EN,
    nav_pricing:'Tarifs',nav_login:'Se connecter',nav_signup:'Essayer gratuitement',nav_dashboard:'Tableau de bord',
    hero_headline:"Quelle action faire aujourd\u2019hui pour d\u00e9crocher plus de clients gr\u00e2ce au r\u00e9f\u00e9rencement\u00a0?",
    hero_sub:'Veltro vous r\u00e9pond chaque semaine \u2014 avec des pages pr\u00eates \u00e0 publier, pas de tableaux de bord inutiles.',
    hero_cta:'Essayer gratuitement \u2014 7 jours',hero_demo:'Voir comment \u00e7a fonctionne',
    how_title:'Comment \u00e7a marche',
    how_s1:'1. Entrez l\u2019adresse de votre site',how_s1d:'Veltro identifie automatiquement votre technologie \u2014 Next.js, WordPress, Webflow, et 7 autres.',
    how_s2:'2. Connectez vos donn\u00e9es',how_s2d:'Reliez GSC + GA4 pour passer d\u2019estimations indicatives \u00e0 vos vrais chiffres.',
    how_s3:'3. Choisissez votre formule',how_s3d:'Votre premi\u00e8re analyse SEO d\u00e9marre imm\u00e9diatement. R\u00e9sultats par WhatsApp et email.',
    how_s4:'4. Chaque semaine, sans effort',how_s4d:'Veltro d\u00e9tecte les opportunit\u00e9s, g\u00e9n\u00e8re les pages, vous les livre. Vous d\u00e9ployez en 30 minutes.',
    stacks_title:'Compatible avec toutes les technologies',
    pricing_title:'Des tarifs simples, pens\u00e9s pour votre croissance',
    pricing_sub:'7 jours d\u2019essai gratuit. Aucune carte bancaire exig\u00e9e.',
    pricing_monthly:'Mensuel',pricing_annual:'Annuel \u2014 \u00e9conomisez 17\u00a0%',pricing_lifetime:'\u00c0 vie',
    pricing_mo:'/mois',pricing_yr:'/an',pricing_cta:'D\u00e9marrer gratuitement',pricing_popular:'Le plus choisi',
    pay_title:'Tous les moyens de paiement sont accept\u00e9s',
    onboard_title:'Configurer votre compte Veltro',
    onboard_steps:'Compte|Votre site|Votre activit\u00e9|Search Console|Analytics|Formule|C\u2019est parti\u00a0!',
    account_title:'Cr\u00e9er votre compte',name_label:'Pr\u00e9nom et nom',email_label:'Adresse email',
    password_label:'Mot de passe',phone_label:'Num\u00e9ro de t\u00e9l\u00e9phone (pour recevoir vos r\u00e9sultats sur WhatsApp)',
    phone_hint:'Avec l\u2019indicatif pays\u00a0: +237 600 000 000',country_label:'Pays',lang_label:'Langue de travail',
    domain_title:'Quelle est l\u2019adresse de votre site\u00a0?',domain_label:'Adresse du site web',domain_hint:'ex. whisperience.com',
    detecting:'D\u00e9tection de la technologie en cours\u2026',
    stack_detected:'{{stack}} d\u00e9tect\u00e9 \u2014 {{confidence}}\u00a0% de certitude',
    stack_low:'Technologie non identifi\u00e9e \u2014 nous utiliserons le format universel HTML',
    stack_title:'Dites-nous ce que fait votre entreprise',biz_type_label:'Type d\u2019activit\u00e9',
    biz_type_hint:'ex. SaaS B2B, E-commerce, Agence',revenue_goal:"Objectif de chiffre d\u2019affaires mensuel ($)",
    aov_label:"Valeur moyenne d\u2019une vente ($)",keywords_label:'Mots-cl\u00e9s de d\u00e9part (1 \u00e0 20)',
    keywords_hint:'Tapez un mot-cl\u00e9 et appuyez sur Entr\u00e9e. Veltro fera le reste.',
    gsc_title:'Connectez Google Search Console',
    gsc_desc:'Acc\u00e8s \u00e0 vos vraies donn\u00e9es de clics et de positionnement \u2014 vos estimations de revenus deviennent pr\u00e9cises.',
    gsc_cta:'Se connecter avec Google',gsc_skip:'Passer cette \u00e9tape (les estimations resteront indicatives)',
    ga4_title:'S\u00e9lectionnez votre propri\u00e9t\u00e9 GA4',
    ga4_desc:'Veltro utilise GA4 pour mesurer vos taux de conversion r\u00e9els et vos revenus par page.',
    ga4_property:'Identifiant de propri\u00e9t\u00e9 GA4',ga4_hint:'GA4 \u2192 Administration \u2192 Param\u00e8tres de la propri\u00e9t\u00e9 \u2192 Identifiant',
    ga4_skip:'Passer (Veltro utilisera les moyennes du secteur)',plan_title:'Choisissez votre formule',pay_method:'Mode de paiement',
    done_title:'Tout est pr\u00eat \u2014 bienvenue\u00a0!',
    done_desc:"Votre premi\u00e8re analyse SEO est en cours. R\u00e9sultats par email{{wa}} d\u2019ici 10 minutes.",
    done_wa:' et WhatsApp',done_cta:'Acc\u00e9der au tableau de bord',
    dash_title:'Tableau de bord \u2014 Revenus',dash_upside:'Potentiel annuel total',dash_quickwin:'Gains imm\u00e9diats (Top 3)',
    dash_found:'Opportunit\u00e9s identifi\u00e9es',dash_auto:'Publication automatique',dash_all:'Toutes',
    dash_autotab:'Publication auto',dash_manual:'Manuel',dash_annual:'Gain annuel',dash_monthly:'Par mois',
    dash_effort:'Effort',dash_evidence:'Donn\u00e9es',dash_implement:"Plan d\u2019action",
    dash_deploy:'\u26a1 Publier automatiquement',dash_download:'T\u00e9l\u00e9charger le pack ZIP',
    footer_copy:'\u00a9 2026 Veltro \u00b7 Veltro \u00b7 Pens\u00e9 pour les entreprises africaines et mondiales',
    next:'Suivant',back:'Retour',skip:'Passer',
  },
  ar: {...EN,
    nav_pricing:'\u0627\u0644\u0623\u0633\u0639\u0627\u0631',nav_login:'\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',nav_signup:'\u0627\u0628\u062f\u0623 \u0645\u062c\u0627\u0646\u0627\u064b',nav_dashboard:'\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645',
    hero_headline:'\u0645\u0627\u0630\u0627 \u064a\u062c\u0628 \u0623\u0646 \u062a\u0641\u0639\u0644 \u0627\u0644\u064a\u0648\u0645 \u0644\u062a\u062d\u0642\u064a\u0642 \u0623\u0639\u0644\u0649 \u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0645\u0646 \u0645\u062d\u0631\u0643\u0627\u062a \u0627\u0644\u0628\u062d\u062b\u061f',
    hero_sub:'\u0641\u064a\u0644\u062a\u0631\u0648 \u064a\u062c\u064a\u0628 \u0643\u0644 \u0623\u0633\u0628\u0648\u0639 \u2014 \u0628\u0635\u0641\u062d\u0627\u062a \u062c\u0627\u0647\u0632\u0629 \u0644\u0644\u0646\u0634\u0631\u060c \u0644\u0627 \u0645\u062c\u0631\u062f \u062a\u0642\u0627\u0631\u064a\u0631.',
    hero_cta:'\u0627\u0628\u062f\u0623 \u0645\u062c\u0627\u0646\u0627\u064b \u2014 7 \u0623\u064a\u0627\u0645',hero_demo:'\u0643\u064a\u0641 \u064a\u0639\u0645\u0644',
    how_title:'\u0643\u064a\u0641 \u064a\u0639\u0645\u0644',
    how_s1:'\u0661. \u0623\u062f\u062e\u0644 \u0631\u0627\u0628\u0637 \u0645\u0648\u0642\u0639\u0643',how_s1d:'\u064a\u0643\u062a\u0634\u0641 \u0641\u064a\u0644\u062a\u0631\u0648 \u062a\u0642\u0646\u064a\u062a\u0643 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b.',
    how_s2:'\u0662. \u0631\u0628\u0637 \u0628\u064a\u0627\u0646\u0627\u062a\u0643',how_s2d:'\u0627\u0631\u0628\u0637 GSC + GA4 \u0644\u062a\u062d\u0648\u064a\u0644 \u0627\u0644\u062a\u0642\u062f\u064a\u0631\u0627\u062a \u0625\u0644\u0649 \u0623\u0631\u0642\u0627\u0645 \u062d\u0642\u064a\u0642\u064a\u0629.',
    how_s3:'\u0663. \u0627\u062e\u062a\u0631 \u062e\u0637\u062a\u0643',how_s3d:'\u064a\u0628\u062f\u0623 \u0623\u0648\u0644 \u062a\u062d\u0644\u064a\u0644 SEO \u0641\u0648\u0631\u0627\u064b.',
    how_s4:'\u0664. \u0643\u0644 \u0623\u0633\u0628\u0648\u0639 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b',how_s4d:'\u064a\u0643\u062a\u0634\u0641 \u0641\u064a\u0644\u062a\u0631\u0648 \u0627\u0644\u0641\u0631\u0635\u060c \u064a\u0648\u0644\u062f \u0627\u0644\u0635\u0641\u062d\u0627\u062a\u060c \u064a\u0633\u0644\u0645\u0647\u0627 \u0625\u0644\u064a\u0643.',
    stacks_title:'\u064a\u0639\u0645\u0644 \u0645\u0639 \u0623\u064a \u062a\u0642\u0646\u064a\u0629',
    pricing_title:'\u0623\u0633\u0639\u0627\u0631 \u0628\u0633\u064a\u0637\u0629 \u062a\u0639\u0632\u0632 \u0646\u0645\u0648 \u0639\u0645\u0644\u0643',pricing_sub:'\u062a\u062c\u0631\u0628\u0629 \u0645\u062c\u0627\u0646\u064a\u0629 7 \u0623\u064a\u0627\u0645. \u0644\u0627 \u0628\u0637\u0627\u0642\u0629 \u0627\u0626\u062a\u0645\u0627\u0646 \u0645\u0637\u0644\u0648\u0628\u0629.',
    pricing_monthly:'\u0634\u0647\u0631\u064a',pricing_annual:'\u0633\u0646\u0648\u064a (\u0648\u0641\u0651\u0631 17%)',pricing_lifetime:'\u0645\u062f\u0649 \u0627\u0644\u062d\u064a\u0627\u0629',
    pricing_mo:'/\u0634\u0647\u0631',pricing_yr:'/\u0633\u0646\u0629',pricing_cta:'\u0627\u0628\u062f\u0623 \u0645\u062c\u0627\u0646\u0627\u064b',pricing_popular:'\u0627\u0644\u0623\u0643\u062b\u0631 \u0634\u0639\u0628\u064a\u0629',
    pay_title:'\u062c\u0645\u064a\u0639 \u0637\u0631\u0642 \u0627\u0644\u062f\u0641\u0639 \u0645\u0642\u0628\u0648\u0644\u0629',
    onboard_title:'\u0625\u0639\u062f\u0627\u062f \u062d\u0633\u0627\u0628 \u0641\u064a\u0644\u062a\u0631\u0648',
    onboard_steps:'\u0627\u0644\u062d\u0633\u0627\u0628|\u0627\u0644\u0645\u0648\u0642\u0639|\u0646\u0634\u0627\u0637\u0643|Search Console|Analytics|\u0627\u0644\u062e\u0637\u0629|\u062c\u0627\u0647\u0632',
    account_title:'\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628\u0643',name_label:'\u0627\u0633\u0645\u0643',email_label:'\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a',
    password_label:'\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',phone_label:'\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641 (\u0644\u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0644\u0646\u062a\u0627\u0626\u062c \u0639\u0628\u0631 \u0648\u0627\u062a\u0633\u0627\u0628)',
    phone_hint:'\u0623\u062f\u062e\u0644 \u0631\u0645\u0632 \u0627\u0644\u062f\u0648\u0644\u0629: \u0645\u062b\u0644\u0627\u064b +966 50 000 0000',country_label:'\u0627\u0644\u0628\u0644\u062f',lang_label:'\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0645\u0641\u0636\u0644\u0629',
    domain_title:'\u0645\u0627 \u0647\u0648 \u0631\u0627\u0628\u0637 \u0645\u0648\u0642\u0639\u0643\u061f',domain_label:'\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0648\u0642\u0639',domain_hint:'\u0645\u062b\u0627\u0644: example.com',
    detecting:'\u062c\u0627\u0631\u0645 \u0627\u0643\u062a\u0634\u0627\u0641 \u0627\u0644\u062a\u0642\u0646\u064a\u0629\u2026',
    stack_detected:'\u062a\u0645 \u0627\u0643\u062a\u0634\u0627\u0641 {{stack}} (\u0646\u0633\u0628\u0629 \u0627\u0644\u062b\u0642\u0629 {{confidence}}%)',
    stack_low:'\u0644\u0645 \u064a\u062a\u0645 \u0627\u0643\u062a\u0634\u0627\u0641 \u0627\u0644\u062a\u0642\u0646\u064a\u0629 \u2014 \u0633\u064a\u062a\u0645 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0635\u064a\u063a\u0629 HTML \u0627\u0644\u0639\u0627\u0644\u0645\u064a\u0629',
    stack_title:'\u0623\u062e\u0628\u0631\u0646\u0627 \u0639\u0646 \u0646\u0634\u0627\u0637\u0643 \u0627\u0644\u062a\u062c\u0627\u0631\u064a',biz_type_label:'\u0646\u0648\u0639 \u0627\u0644\u0646\u0634\u0627\u0637',
    biz_type_hint:'\u0645\u062b\u0627\u0644: SaaS B2B\u060c \u062a\u062c\u0627\u0631\u0629 \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a\u0629\u060c \u0648\u0643\u0627\u0644\u0629',revenue_goal:'\u0647\u062f\u0641 \u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a \u0627\u0644\u0634\u0647\u0631\u064a ($)',
    aov_label:'\u0645\u062a\u0648\u0633\u0637 \u0642\u064a\u0645\u0629 \u0627\u0644\u0637\u0644\u0628 ($)',keywords_label:'\u0627\u0644\u0643\u0644\u0645\u0627\u062a \u0627\u0644\u0645\u0641\u062a\u0627\u062d\u064a\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629 (1\u201320)',
    keywords_hint:'\u0627\u0643\u062a\u0628 \u0643\u0644\u0645\u0629 \u0645\u0641\u062a\u0627\u062d\u064a\u0629 \u062b\u0645 \u0627\u0636\u063a\u0637 Enter.',
    gsc_title:'\u0631\u0628\u0637 Google Search Console',
    gsc_desc:'\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0646\u0642\u0631\u0627\u062a \u0648\u0627\u0644\u062a\u0631\u062a\u064a\u0628\u0627\u062a \u0627\u0644\u062d\u0642\u064a\u0642\u064a\u0629.',
    gsc_cta:'\u0627\u0644\u0631\u0628\u0637 \u0639\u0628\u0631 Google',gsc_skip:'\u062a\u062e\u0637\u064a \u0627\u0644\u0622\u0646 (\u0633\u062a\u0643\u0648\u0646 \u0627\u0644\u062a\u0642\u062f\u064a\u0631\u0627\u062a \u062a\u0642\u0631\u064a\u0628\u064a\u0629)',
    ga4_title:'\u0627\u062e\u062a\u0631 \u062e\u0627\u0635\u064a\u0629 GA4',ga4_desc:'\u064a\u0633\u062a\u062e\u062f\u0645 \u0641\u064a\u0644\u062a\u0631\u0648 GA4 \u0644\u0642\u064a\u0627\u0633 \u0645\u0639\u062f\u0644\u0627\u062a \u0627\u0644\u062a\u062d\u0648\u064a\u0644 \u0648\u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a.',
    ga4_property:'\u0645\u0639\u0631\u0641 \u062e\u0627\u0635\u064a\u0629 GA4',ga4_hint:'GA4 \u2190 \u0627\u0644\u0625\u062f\u0627\u0631\u0629 \u2190 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u062e\u0627\u0635\u064a\u0629 \u2190 \u0645\u0639\u0631\u0641 \u0627\u0644\u062e\u0627\u0635\u064a\u0629',
    ga4_skip:'\u062a\u062e\u0637\u064a (\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0645\u0639\u0627\u064a\u064a\u0631 \u0627\u0644\u0635\u0646\u0627\u0639\u0629)',plan_title:'\u0627\u062e\u062a\u0631 \u062e\u0637\u062a\u0643',pay_method:'\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639',
    done_title:'\u0623\u0646\u062a \u062c\u0627\u0647\u0632! \u0623\u0647\u0644\u0627\u064b \u0628\u0643',
    done_desc:'\u062c\u0627\u0631\u0645 \u062a\u062d\u0644\u064a\u0644 SEO \u0627\u0644\u0623\u0648\u0644. \u0633\u062a\u0635\u0644\u0643 \u0627\u0644\u0646\u062a\u0627\u0626\u062c \u0639\u0628\u0631 \u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a{{wa}} \u062e\u0644\u0627\u0644 10 \u062f\u0642\u0627\u0626\u0642.',
    done_wa:' \u0648\u0648\u0627\u062a\u0633\u0627\u0628',done_cta:'\u0627\u0644\u0630\u0647\u0627\u0628 \u0625\u0644\u0649 \u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645',
    dash_title:'\u0644\u0648\u062d\u0629 \u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a',dash_upside:'\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0641\u0631\u0635 \u0627\u0644\u0633\u0646\u0648\u064a\u0629',dash_quickwin:'\u0623\u0633\u0631\u0639 \u0627\u0644\u0645\u0643\u0627\u0633\u0628 (\u0623\u0641\u0636\u0644 3)',
    dash_found:'\u0641\u0631\u0635 \u0645\u0643\u062a\u0634\u0641\u0629',dash_auto:'\u0642\u0627\u0628\u0644 \u0644\u0644\u0646\u0634\u0631 \u0627\u0644\u062a\u0644\u0642\u0627\u0626\u064a',dash_all:'\u0627\u0644\u0643\u0644',dash_autotab:'\u0646\u0634\u0631 \u062a\u0644\u0642\u0627\u0626\u064a',
    dash_manual:'\u064a\u062f\u0648\u064a',dash_annual:'\u0645\u0643\u0633\u0628 \u0633\u0646\u0648\u064a',dash_monthly:'\u0634\u0647\u0631\u064a',dash_effort:'\u0627\u0644\u062c\u0647\u062f',
    dash_evidence:'\u0627\u0644\u0623\u062f\u0644\u0629',dash_implement:'\u062e\u0637\u0629 \u0627\u0644\u062a\u0646\u0641\u064a\u0630',
    dash_deploy:'\u26a1 \u0646\u0634\u0631 \u062a\u0644\u0642\u0627\u0626\u064a \u0627\u0644\u0622\u0646',dash_download:'\u062a\u062d\u0645\u064a\u0644 \u062d\u0632\u0645\u0629 \u0627\u0644\u0625\u0635\u0644\u0627\u062d',
    footer_copy:'\u00a9 2026 Veltro \u00b7 Veltro \u00b7 \u062e\u062f\u0645\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0641\u064a \u0623\u0641\u0631\u064a\u0642\u064a\u0627 \u0648\u0627\u0644\u0639\u0627\u0644\u0645',
    next:'\u0627\u0644\u062a\u0627\u0644\u064a',back:'\u0631\u062c\u0648\u0639',skip:'\u062a\u062e\u0637\u064a',
  },
  zh: {...EN,
    nav_pricing:'\u4ef7\u683c\u65b9\u6848',nav_login:'\u767b\u5f55',nav_signup:'\u514d\u8d39\u5f00\u59cb',nav_dashboard:'\u63a7\u5236\u53f0',
    hero_headline:'\u4eca\u5929\u8be5\u505a\u4ec0\u4e48\uff0c\u624d\u80fd\u4ece\u641c\u7d22\u4e2d\u83b7\u5f97\u6700\u591a\u8425\u6536\uff1f',
    hero_sub:'Veltro \u6bcf\u5468\u4e3a\u60a8\u63d0\u4f9b\u7b54\u6848 \u2014 \u4ea4\u4ed8\u53ef\u76f4\u63a5\u90e8\u7f72\u7684\u9875\u9762\uff0c\u800c\u975e\u4ec5\u4ec5\u62a5\u544a\u3002',
    hero_cta:'\u514d\u8d39\u8bd5\u7528 \u2014 7\u5929',hero_demo:'\u4e86\u89e3\u5982\u4f55\u8fd0\u4f5c',how_title:'\u5982\u4f55\u8fd0\u4f5c',
    how_s1:'1. \u8f93\u5165\u60a8\u7684\u7f51\u5740',how_s1d:'Veltro \u81ea\u52a8\u8bc6\u522b\u60a8\u7684\u6280\u672f\u6808\u3002',
    how_s2:'2. \u8fde\u63a5\u6570\u636e',how_s2d:'\u8fde\u63a5 GSC + GA4\uff0c\u5c06\u9884\u4f30\u6536\u76ca\u8f6c\u5316\u4e3a\u7cbe\u786e\u7684\u771f\u5b9e\u6570\u636e\u3002',
    how_s3:'3. \u9009\u62e9\u60a8\u7684\u65b9\u6848',how_s3d:'\u7acb\u5373\u542f\u52a8\u9996\u6b21 SEO \u5206\u6790\u3002',
    how_s4:'4. \u6bcf\u5468\u81ea\u52a8\u6267\u884c',how_s4d:'Veltro \u53d1\u73b0\u673a\u4f1a\u3001\u751f\u6210\u9875\u9762\u3001\u4ea4\u4ed8\u6210\u679c\u3002\u60a8\u53ea\u9700 30 \u5206\u949f\u5b8c\u6210\u90e8\u7f72\u3002',
    stacks_title:'\u517c\u5bb9\u6240\u6709\u6280\u672f\u6808',
    pricing_title:'\u7b80\u5355\u900f\u660e\u7684\u5b9a\u4ef7\uff0c\u4e13\u4e3a\u4e1a\u52a1\u589e\u957f\u8bbe\u8ba1',pricing_sub:'\u6240\u6709\u65b9\u6848\u5747\u63d0\u4f9b7\u5929\u514d\u8d39\u8bd5\u7528\uff0c\u65e0\u9700\u4fe1\u7528\u5361\u3002',
    pricing_monthly:'\u6309\u6708\u4ed8\u8d39',pricing_annual:'\u6309\u5e74\u4ed8\u8d39\uff08\u8282\u770117%\uff09',pricing_lifetime:'\u7ec8\u8eab\u7248',
    pricing_mo:'/\u6708',pricing_yr:'/\u5e74',pricing_cta:'\u514d\u8d39\u5f00\u59cb',pricing_popular:'\u6700\u53d7\u6b22\u8fce',
    pay_title:'\u652f\u6301\u591a\u79cd\u652f\u4ed8\u65b9\u5f0f',
    onboard_title:'\u8bbe\u7f6e\u60a8\u7684 Veltro \u8d26\u6237',
    onboard_steps:'\u8d26\u6237|\u7f51\u7ad9|\u4e1a\u52a1\u4fe1\u606f|\u641c\u7d22\u63a7\u5236\u53f0|\u5206\u6790\u5de5\u5177|\u65b9\u6848|\u5b8c\u6210',
    account_title:'\u521b\u5efa\u8d26\u6237',name_label:'\u60a8\u7684\u59d3\u540d',email_label:'\u7535\u5b50\u90ae\u4ef6',
    password_label:'\u5bc6\u7801',phone_label:'\u624b\u673a\u53f7\uff08\u7528\u4e8e WhatsApp \u63a8\u9001\u7ed3\u679c\uff09',
    phone_hint:'\u5305\u542b\u56fd\u5bb6\u4ee3\u7801\uff0c\u4f8b\u5982 +86 138 0000 0000',country_label:'\u56fd\u5bb6/\u5730\u533a',lang_label:'\u9996\u9009\u8bed\u8a00',
    domain_title:'\u60a8\u7684\u7f51\u7ad9\u5730\u5740\u662f\u4ec0\u4e48\uff1f',domain_label:'\u7f51\u7ad9\u7f51\u5740',domain_hint:'\u4f8b\u5982 example.com',
    detecting:'\u6b63\u5728\u8bc6\u522b\u60a8\u7684\u6280\u672f\u6808\u2026',
    stack_detected:'\u5df2\u8bc6\u522b {{stack}}\uff08\u7f6e\u4fe1\u5ea6 {{confidence}}%\uff09',
    stack_low:'\u672a\u8bc6\u522b\u6280\u672f\u6808 \u2014 \u5c06\u4f7f\u7528\u901a\u7528 HTML \u683c\u5f0f',
    stack_title:'\u544a\u8bc9\u6211\u4eec\u60a8\u7684\u4e1a\u52a1',biz_type_label:'\u4e1a\u52a1\u7c7b\u578b',
    biz_type_hint:'\u4f8b\u5982 B2B SaaS\u3001\u8de8\u5883\u7535\u5546\u3001\u8d38\u6613\u516c\u53f8',revenue_goal:'\u6708\u8425\u6536\u76ee\u6807\uff08$\uff09',
    aov_label:'\u5e73\u5747\u8ba2\u5355\u91d1\u989d\uff08$\uff09',keywords_label:'\u5173\u952e\u8bcd\u79cd\u5b50\uff081\u201320\u4e2a\uff09',
    keywords_hint:'\u8f93\u5165\u5173\u952e\u8bcd\u540e\u6309\u56de\u8f66\u3002',
    gsc_title:'\u8fde\u63a5 Google Search Console',
    gsc_desc:'\u83b7\u53d6\u771f\u5b9e\u7684\u70b9\u51fb\u91cf\u548c\u6392\u540d\u6570\u636e \u2014 \u5c06\u8425\u6536\u9884\u4f30\u8f6c\u5316\u4e3a\u7cbe\u786e\u6570\u5b57\u3002',
    gsc_cta:'\u4f7f\u7528 Google \u8d26\u6237\u8fde\u63a5',gsc_skip:'\u6682\u65f6\u8df3\u8fc7\uff08\u9884\u4f30\u6570\u636e\u5c06\u4e3a\u8fd1\u4f3c\u5024\uff09',
    ga4_title:'\u9009\u62e9\u60a8\u7684 GA4 \u5a92\u4f53\u8d44\u6e90',ga4_desc:'Veltro \u4f7f\u7528 GA4 \u8861\u91cf\u5b9e\u9645\u8f6c\u5316\u7387\u548c\u6bcf\u9875\u6536\u76ca\u3002',
    ga4_property:'GA4 \u5a92\u4f53\u8d44\u6e90 ID',ga4_hint:'GA4 \u2192 \u7ba1\u7406 \u2192 \u5a92\u4f53\u8d44\u6e90\u8bbe\u7f6e \u2192 \u5a92\u4f53\u8d44\u6e90 ID',
    ga4_skip:'\u8df3\u8fc7\uff08\u5c06\u4f7f\u7528\u884c\u4e1a\u57fa\u51c6\u6570\u636e\uff09',plan_title:'\u9009\u62e9\u60a8\u7684\u65b9\u6848',pay_method:'\u652f\u4ed8\u65b9\u5f0f',
    done_title:'\u4e00\u5207\u5c31\u7eea\uff0c\u6b22\u8fce\uff01',
    done_desc:'\u9996\u6b21 SEO \u5206\u6790\u6b63\u5728\u8fdb\u884c\u4e2d\u3002\u7ed3\u679c\u5c06\u5728 10 \u5206\u949f\u5185\u53d1\u9001\u81f3\u60a8\u7684\u90ae\u7b71{{wa}}\u3002',
    done_wa:'\u548c WhatsApp',done_cta:'\u524d\u5f80\u63a7\u5236\u53f0',
    dash_title:'\u8425\u6536\u770b\u677f',dash_upside:'\u5e74\u5ea6\u6f5c\u5728\u603b\u6536\u76ca',dash_quickwin:'\u5feb\u901f\u6536\u76ca\uff08\u524d3\u540d\uff09',
    dash_found:'\u5df2\u8bc6\u522b\u673a\u4f1a',dash_auto:'\u53ef\u81ea\u52a8\u90e8\u7f72',dash_all:'\u5168\u90e8',dash_autotab:'\u81ea\u52a8\u90e8\u7f72',
    dash_manual:'\u624b\u52a8',dash_annual:'\u5e74\u5ea6\u6536\u76ca',dash_monthly:'\u6708\u5ea6\u6536\u76ca',dash_effort:'\u5de5\u4f5c\u91cf',
    dash_evidence:'\u6570\u636e\u4f9d\u636e',dash_implement:'\u6267\u884c\u65b9\u6848',
    dash_deploy:'\u26a1 \u7acb\u5373\u81ea\u52a8\u90e8\u7f72',dash_download:'\u4e0b\u8f7d\u4fee\u590d\u5305',
    footer_copy:'\u00a9 2026 Veltro \u00b7 Veltro \u00b7 \u670d\u52a1\u5168\u7403\u4f01\u4e1a',
    next:'\u4e0b\u4e00\u6b65',back:'\u8fd4\u56de',skip:'\u8df3\u8fc7',
  },
  sw: {...EN,
    nav_pricing:'Bei',nav_login:'Ingia',nav_signup:'Anza bure',nav_dashboard:'Dashibodi',
    hero_headline:'Unapaswa kufanya nini leo kupata mapato zaidi kutoka utafutaji?',
    hero_sub:'Veltro inakujibu kila wiki \u2014 na kurasa tayari kuchapishwa, si ripoti tu.',
    hero_cta:'Anza bure \u2014 siku 7',hero_demo:'Jinsi inavyofanya kazi',how_title:'Jinsi inavyofanya kazi',
    how_s1:'1. Weka anwani ya tovuti yako',how_s1d:'Veltro inagundua teknolojia yako kiotomatiki.',
    how_s2:'2. Unganisha data yako',how_s2d:'Unganisha GSC + GA4 kubadilisha makadirio na nambari zako halisi.',
    how_s3:'3. Chagua mpango wako',how_s3d:'Uchambuzi wako wa kwanza wa SEO unaanza mara moja.',
    how_s4:'4. Kila wiki, kiotomatiki',how_s4d:'Veltro inapata fursa, inatengeneza kurasa, inakuwasilishia. Unaweka mtandaoni kwa dakika 30.',
    stacks_title:'Inafanya kazi na teknolojia yoyote',
    pricing_title:'Bei rahisi, iliyoundwa kwa ukuaji wa biashara',pricing_sub:'Jaribio la siku 7 bure. Hakuna kadi ya mkopo.',
    pricing_monthly:'Kila mwezi',pricing_annual:'Kila mwaka (okoa 17%)',pricing_lifetime:'Milele',
    pricing_mo:'/mwezi',pricing_yr:'/mwaka',pricing_cta:'Anza bure',pricing_popular:'Inayopendwa zaidi',
    pay_title:'Njia zote za malipo zinakubaliwa',
    onboard_title:'Sanidi Veltro yako',
    onboard_steps:'Akaunti|Tovuti|Biashara yako|Search Console|Analytics|Mpango|Tayari',
    account_title:'Unda akaunti yako',name_label:'Jina lako',email_label:'Barua pepe',
    password_label:'Nenosiri',phone_label:'Nambari ya simu (kwa matokeo ya WhatsApp)',
    phone_hint:'Jumuisha nambari ya nchi: +255 700 000 000',country_label:'Nchi',lang_label:'Lugha unayopendelea',
    domain_title:'Anwani ya tovuti yako ni nini?',domain_label:'Anwani ya tovuti',domain_hint:'Mfano: tovutiyako.com',
    detecting:'Inagundua teknolojia yako\u2026',
    stack_detected:'{{stack}} imegunduliwa (uhakika wa {{confidence}}%)',
    stack_low:'Teknolojia haikugunduliwa \u2014 tutumia muundo wa HTML wa kawaida',
    stack_title:'Tuambie kuhusu biashara yako',biz_type_label:'Aina ya biashara',
    biz_type_hint:'Mfano: SaaS B2B, Biashara ya mtandaoni, Wakala',revenue_goal:'Lengo la mapato ya kila mwezi ($)',
    aov_label:'Thamani ya wastani ya agizo ($)',keywords_label:'Maneno muhimu ya msingi (1\u201320)',
    keywords_hint:'Andika neno muhimu kisha bonyeza Enter.',
    gsc_title:'Unganisha Google Search Console',
    gsc_desc:'Inatoa data halisi ya mibofyo na nafasi \u2014 makadirio ya mapato yanakuwa sahihi.',
    gsc_cta:'Unganisha na Google',gsc_skip:'Ruka kwa sasa (makadirio yatakuwa ya takriban)',
    ga4_title:'Chagua mali yako ya GA4',ga4_desc:'Veltro inatumia GA4 kupima viwango halisi vya ubadilishaji.',
    ga4_property:'Kitambulisho cha mali ya GA4',ga4_hint:'GA4 \u2192 Simamia \u2192 Mipangilio ya mali \u2192 Kitambulisho',
    ga4_skip:'Ruka (tumia viwango vya sekta)',plan_title:'Chagua mpango wako',pay_method:'Njia ya malipo',
    done_title:'Kila kitu kiko tayari! Karibu',
    done_desc:'Uchambuzi wako wa kwanza wa SEO unaendelea. Matokeo kwa barua pepe{{wa}} ndani ya dakika 10.',
    done_wa:' na WhatsApp',done_cta:'Nenda kwenye dashibodi',
    dash_title:'Dashibodi ya Mapato',dash_upside:'Jumla ya Fursa za Kila Mwaka',dash_quickwin:'Faida za Haraka (Top 3)',
    dash_found:'Fursa Zilizopatikana',dash_auto:'Inaweza Kuchapishwa Kiotomatiki',dash_all:'Zote',
    dash_autotab:'Kiotomatiki',dash_manual:'Mwenyewe',dash_annual:'Faida ya Kila Mwaka',
    dash_monthly:'Kila Mwezi',dash_effort:'Juhudi',dash_evidence:'Data',dash_implement:'Mpango wa Utekelezaji',
    dash_deploy:'\u26a1 Chapisha Kiotomatiki',dash_download:'Pakua Kifurushi',
    footer_copy:'\u00a9 2026 Veltro \u00b7 Veltro \u00b7 Kwa biashara za Afrika na ulimwengu',
    next:'Ifuatayo',back:'Rudi',skip:'Ruka',
  },
};

// ─── i18n ENGINE ──────────────────────────────────────────────────────────────
const I18nCtx = createContext({ locale:'fr', setLocale:()=>{}, t:(k)=>EN[k]??k, loading:false });
const useI18n = () => useContext(I18nCtx);

function interpolate(str, vars) {
  if (!vars || !str) return str;
  return Object.entries(vars).reduce((s,[k,v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`,'g'), v), str);
}

function detectLocale() {
  if (typeof navigator === 'undefined') return 'fr';
  const raw = navigator.language?.toLowerCase().split(/[-_]/)[0];
  const map = {'zh':'zh','pt':'pt','sw':'sw'};
  const code = map[raw] ?? raw;
  return SUPPORTED_LOCALES.includes(code) ? code : 'fr';
}

function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState('fr');
  const [translations, setTranslations] = useState(EMBEDDED);
  const [loading, setLoading] = useState(false);
  const fetchQueue = useRef(new Set());

  useEffect(() => { setLocaleState(detectLocale()); }, []);

  useEffect(() => {
    document.documentElement.dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  const fetchLocale = useCallback(async (loc) => {
    if (TIER1.has(loc) || translations[loc] || fetchQueue.current.has(loc)) return;
    fetchQueue.current.add(loc);
    setLoading(true);
    try {
      const res = await fetch(`/api/i18n?locale=${loc}`);
      if (res.ok) {
        const data = await res.json();
        setTranslations(prev => ({ ...prev, [loc]: data }));
      }
    } catch (e) {
      console.warn(`[i18n] Failed to load ${loc}, falling back to EN`);
    } finally {
      setLoading(false);
    }
  }, [translations]);

  const setLocale = useCallback((loc) => {
    setLocaleState(loc);
    if (!TIER1.has(loc) && !translations[loc]) fetchLocale(loc);
  }, [fetchLocale, translations]);

  const t = useCallback((key, vars) => {
    const dict = translations[locale] ?? EN;
    const val = dict[key] ?? EN[key] ?? key;
    return interpolate(val, vars);
  }, [locale, translations]);

  return <I18nCtx.Provider value={{ locale, setLocale, t, loading }}>{children}</I18nCtx.Provider>;
}

// ─── THEME ───────────────────────────────────────────────────────────────────
const C = {
  ink:'#0A0A0B', slate:'#1E1E22', rule:'#2E2E34',
  acid:'#C8FF00', amber:'#F5A623', green:'#00C48C',
  red:'#FF3B30', purple:'#9D9DFF', ghost:'#6B6B72', paper:'#F4F1EB',
};

// ─── PLANS & DATA ─────────────────────────────────────────────────────────────
const PLANS = [
  { id:'STARTER', mo:29,  yr:290,  lt:null, features:['1 site','5 clusters/cycle','2 pages/cycle','Monthly hunt','Email delivery'] },
  { id:'PRO',     mo:79,  yr:790,  lt:null, features:['3 sites','20 clusters/cycle','5 pages/cycle','Weekly hunt','WhatsApp + email','GEO engine'], popular:true },
  { id:'AGENCY',  mo:249, yr:2490, lt:null, features:['10 sites','Unlimited clusters','15 pages/cycle','Daily hunt','WhatsApp + SMS','Auto-deploy'] },
  { id:'LIFETIME',mo:null,yr:null, lt:499,  features:['5 sites','50 clusters/cycle','10 pages/cycle','Weekly hunt','WhatsApp + email','One-time'] },
];

const PAY_METHODS = [
  ['paybridge','PayBridge Africa ⭐'],['stripe','Stripe (card / EU)'],
  ['orange','Orange Money'],['mtn','MTN MoMo'],['wave','Wave'],
];

const MOCK_ACTIONS = [
  { keyword:'B2B lead finder Africa', type:'create_cluster_page', annual:18400, monthly:1533, effort:'3h', priority:1, auto:true,
    explain:'No page exists for this keyword (KD 18, 1,200/mo). Position 3 within 4–6 weeks = $18,400/year.',
    evidence:['Volume: 1,200/mo','KD: 18 (easy)','CTR pos 3: 10.4%','2.5% CVR × $150 AOV'],
    plan:['Create /solutions/b2b-lead-finder-africa','Add FAQPage + SoftwareApp schema','3 internal links from homepage','Submit to GSC'] },
  { keyword:'Apollo.io alternative Africa', type:'comparison_page', annual:24200, monthly:2017, effort:'4h', priority:1, auto:true,
    explain:'5,400/mo — zero competition on Africa angle. Ranks in 6–8 weeks.',
    evidence:['Volume: 5,400/mo','KD: 45','Africa angle uncontested','2% CVR × $150 AOV'],
    plan:['Create /compare/apollo-alternative (1,800 words)','Comparison table','FAQPage schema × 5 Q&As'] },
  { keyword:'Homepage CTR fix', type:'improve_ctr', annual:8100, monthly:675, effort:'0.5h', priority:2, auto:true,
    explain:'Ranks pos 4.2, CTR 3.1% vs benchmark 7.2%. +180 clicks/mo = $8,100/yr.',
    evidence:['CTR: 3.1%','Benchmark pos 4: 7.2%','12,000 impressions/mo','+180 clicks potential'],
    plan:['Rewrite title — include benefit','Meta: benefit + CTA + number'] },
  { keyword:'prospection B2B Afrique francophone', type:'create_cluster_page', annual:12600, monthly:1050, effort:'3h', priority:1, auto:true,
    explain:'KD 12, zero French competition. Ranks in 3–4 weeks.',
    evidence:['Volume: 900/mo (FR)','KD: 12 — very easy','Zero FR competition','$1,050/mo potential'],
    plan:['Create /fr/prospection-b2b-afrique (2,000 words)','HowTo schema in French','Mention RCCM, UEMOA, CEMAC'] },
];

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
function Btn({ children, variant='primary', onClick, full=false, small=false, disabled=false }) {
  const s = {
    primary:   { background:C.acid, color:C.ink, border:'none' },
    secondary: { background:'transparent', color:C.acid, border:`1px solid ${C.acid}` },
    ghost:     { background:'none', color:C.ghost, border:'none', textDecoration:'underline' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...s[variant], padding:small?'7px 16px':'12px 28px', fontSize:small?11:13,
        fontWeight:700, cursor:disabled?'not-allowed':'pointer', letterSpacing:1,
        fontFamily:'DM Mono,monospace', width:full?'100%':'auto', opacity:disabled?0.5:1 }}>
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ fontSize:11, color:C.ghost, textTransform:'uppercase', letterSpacing:1.5, display:'block', marginBottom:6 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:10, color:C.ghost, marginTop:4 }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, type='text', placeholder, onBlur }) {
  return (
    <input type={type} value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder}
      style={{ width:'100%', background:C.slate, border:`1px solid ${C.rule}`, color:C.paper,
        padding:'10px 14px', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'DM Mono,monospace' }} />
  );
}

// ─── LANG PICKER ──────────────────────────────────────────────────────────────
function LangPicker() {
  const { locale, setLocale, loading } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(o=>!o)}
        style={{ background:'none', border:`1px solid ${C.rule}`, color:C.ghost,
          padding:'4px 10px', fontSize:12, cursor:'pointer', fontFamily:'inherit',
          display:'flex', alignItems:'center', gap:6 }}>
        {loading ? '⟳' : LOCALE_META[locale]?.flag} {locale.toUpperCase()} ▾
      </button>
      {open && (
        <div style={{ position:'absolute', right:0, top:'110%', background:C.slate,
          border:`1px solid ${C.rule}`, zIndex:999, display:'grid',
          gridTemplateColumns:'repeat(4,1fr)', gap:2, padding:8, width:280 }}>
          {SUPPORTED_LOCALES.map(l => (
            <button key={l} onClick={() => { setLocale(l); setOpen(false); }}
              style={{ background:l===locale?`${C.acid}22`:'none',
                border:`1px solid ${l===locale?C.acid:'transparent'}`,
                color:l===locale?C.acid:C.ghost, padding:'5px 6px', fontSize:11,
                cursor:'pointer', fontFamily:'inherit', textAlign:'center', position:'relative' }}>
              {LOCALE_META[l]?.flag} {l.toUpperCase()}
              {!TIER1.has(l) && <span style={{ position:'absolute', top:1, right:2, fontSize:7, color:C.amber }}>✦</span>}
            </button>
          ))}
          <div style={{ gridColumn:'1/-1', fontSize:9, color:C.ghost, padding:'4px 0 0', textAlign:'center' }}>✦ loaded on demand</div>
        </div>
      )}
    </div>
  );
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
function Nav({ onSignup, onPricing, showDash=false, onDash }) {
  const { t } = useI18n();
  return (
    <nav style={{ background:C.slate, padding:'0 clamp(16px,4vw,48px)',
      display:'flex', justifyContent:'space-between', alignItems:'center',
      height:60, borderBottom:`1px solid ${C.rule}`, position:'sticky', top:0, zIndex:100, flexWrap:'wrap', gap:8 }}>
      <div style={{ fontSize:20, fontWeight:900, color:C.acid, letterSpacing:3 }}>VELTRO</div>
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        {!showDash && <button onClick={onPricing} style={{ background:'none', border:'none', color:C.ghost, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{t('nav_pricing')}</button>}
        {showDash && <button onClick={onDash} style={{ background:'none', border:'none', color:C.ghost, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>{t('nav_dashboard')}</button>}
        <LangPicker />
        {!showDash && <Btn onClick={onSignup} small>{t('nav_signup')}</Btn>}
      </div>
    </nav>
  );
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function LandingPage({ onSignup, onPricing }) {
  const { t } = useI18n();
  const STACKS = ['Next.js','WordPress','Webflow','Nuxt','Astro','Shopify','Wix','HTML','Squarespace'];
  return (
    <div style={{ background:C.ink, color:C.paper, fontFamily:'DM Mono,monospace', minHeight:'100vh' }}>
      <Nav onSignup={onSignup} onPricing={onPricing} />
      <div style={{ padding:'clamp(40px,8vw,80px) clamp(16px,5vw,48px)', maxWidth:820, margin:'0 auto', textAlign:'center' }}>
        <h1 style={{ fontSize:'clamp(20px,3.5vw,42px)', fontWeight:900, lineHeight:1.25, margin:'0 0 24px' }}>{t('hero_headline')}</h1>
        <p style={{ fontSize:'clamp(13px,1.5vw,16px)', color:'#9B9BA0', lineHeight:1.8, marginBottom:40, maxWidth:580, margin:'0 auto 40px' }}>{t('hero_sub')}</p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <Btn onClick={onSignup}>{t('hero_cta')} →</Btn>
          <Btn variant="secondary" onClick={onPricing}>{t('hero_demo')}</Btn>
        </div>
      </div>
      <div style={{ padding:'24px clamp(16px,5vw,48px)', borderTop:`1px solid ${C.rule}`, borderBottom:`1px solid ${C.rule}` }}>
        <div style={{ textAlign:'center', fontSize:10, color:C.ghost, textTransform:'uppercase', letterSpacing:3, marginBottom:16 }}>{t('stacks_title')}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
          {STACKS.map(s => (
            <div key={s} style={{ background:C.slate, border:`1px solid ${C.rule}`, padding:'7px 14px', fontSize:12, color:C.paper, display:'inline-flex', alignItems:'center', gap:8 }}>
              <span style={{ color:C.acid }}>✓</span>{s}
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding:'clamp(40px,6vw,80px) clamp(16px,5vw,48px)', maxWidth:1000, margin:'0 auto' }}>
        <h2 style={{ fontSize:'clamp(18px,2.5vw,28px)', fontWeight:900, textAlign:'center', marginBottom:40, color:C.acid }}>{t('how_title')}</h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:28 }}>
          {[1,2,3,4].map(n => (
            <div key={n} style={{ borderTop:`3px solid ${C.acid}`, paddingTop:18 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{t(`how_s${n}`)}</div>
              <div style={{ fontSize:12, color:'#9B9BA0', lineHeight:1.7 }}>{t(`how_s${n}d`)}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background:C.slate, padding:'20px clamp(16px,5vw,48px)', borderTop:`1px solid ${C.rule}`,
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, fontSize:10, color:C.ghost }}>
        <span style={{ color:C.acid, fontWeight:900, letterSpacing:3 }}>VELTRO</span>
        <span>{t('footer_copy')}</span>
      </div>
    </div>
  );
}

// ─── PRICING ──────────────────────────────────────────────────────────────────
function PricingPage({ onSelect, onBack }) {
  const { t } = useI18n();
  const [billing, setBilling] = useState('monthly');
  return (
    <div style={{ background:C.ink, color:C.paper, fontFamily:'DM Mono,monospace', minHeight:'100vh' }}>
      <Nav onSignup={onSelect} onPricing={() => {}} />
      <div style={{ padding:'clamp(32px,5vw,56px) clamp(16px,5vw,48px)', maxWidth:1100, margin:'0 auto' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:C.ghost, fontSize:12, cursor:'pointer', marginBottom:24, fontFamily:'inherit' }}>← {t('back')}</button>
        <h1 style={{ fontSize:'clamp(18px,2.5vw,28px)', fontWeight:900, textAlign:'center', margin:'0 0 10px' }}>{t('pricing_title')}</h1>
        <p style={{ textAlign:'center', color:C.ghost, fontSize:13, marginBottom:36 }}>{t('pricing_sub')}</p>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:40 }}>
          {['monthly','annual','lifetime'].map(b => (
            <button key={b} onClick={() => setBilling(b)}
              style={{ padding:'8px 20px', background:billing===b?C.acid:C.rule, color:billing===b?C.ink:C.ghost,
                border:'none', fontSize:11, fontWeight:billing===b?700:400, cursor:'pointer',
                letterSpacing:1, textTransform:'uppercase', fontFamily:'inherit' }}>
              {b==='monthly'?t('pricing_monthly'):b==='annual'?t('pricing_annual'):t('pricing_lifetime')}
            </button>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))', gap:16, alignItems:'start' }}>
          {PLANS.map(p => {
            const price = billing==='annual'?p.yr:billing==='lifetime'?p.lt:p.mo;
            const suffix = billing==='annual'?t('pricing_yr'):billing==='lifetime'?'':t('pricing_mo');
            return (
              <div key={p.id} style={{ background:p.popular?C.slate:C.ink, border:`2px solid ${p.popular?C.acid:C.rule}`,
                padding:24, display:'flex', flexDirection:'column', gap:14, position:'relative' }}>
                {p.popular && (
                  <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)',
                    background:C.acid, color:C.ink, fontSize:10, fontWeight:700, padding:'2px 14px', letterSpacing:1, whiteSpace:'nowrap' }}>
                    {t('pricing_popular').toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontSize:11, color:C.ghost, textTransform:'uppercase', letterSpacing:2, marginBottom:4 }}>{p.id}</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                    {price!=null
                      ? <><span style={{ fontSize:38, fontWeight:900, color:C.acid }}>${price}</span><span style={{ fontSize:13, color:C.ghost }}>{suffix}</span></>
                      : <span style={{ fontSize:15, color:C.ghost }}>Custom</span>}
                  </div>
                </div>
                <ul style={{ listStyle:'none', padding:0, margin:0, flex:1, display:'flex', flexDirection:'column', gap:7 }}>
                  {p.features.map((f,i) => (
                    <li key={i} style={{ fontSize:12, color:'#C8D0D8', display:'flex', gap:8 }}>
                      <span style={{ color:C.green, flexShrink:0 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <Btn full onClick={() => onSelect(p.id)} variant={p.popular?'primary':'secondary'}>{t('pricing_cta')} →</Btn>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop:48, padding:24, background:C.slate, border:`1px solid ${C.rule}` }}>
          <div style={{ fontSize:11, color:C.ghost, textTransform:'uppercase', letterSpacing:2, marginBottom:12 }}>{t('pay_title')}</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {PAY_METHODS.map(([,label],i) => <span key={i} style={{ background:C.rule, color:'#9B9BA0', fontSize:11, padding:'6px 14px' }}>{label}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardWizard({ onDone }) {
  const { t, locale, setLocale } = useI18n();
  const [step, setStep] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [detectedStack, setDetectedStack] = useState(null);
  const [form, setForm] = useState({
    name:'', email:'', password:'', phone:'', country:'CM', lang:locale.toUpperCase(),
    domain:'', businessType:'', revenueGoal:5000, aov:100, keywords:[], kwInput:'', plan:'PRO', payMethod:'paybridge',
  });
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const steps = t('onboard_steps').split('|');
  const pct = Math.round((step / (steps.length - 1)) * 100);
  const isRTL = RTL_LOCALES.has(locale);

  const detectStack = async (d) => {
    if (!d) return;
    setDetecting(true);
    await new Promise(r => setTimeout(r, 1400));
    setDetectedStack(['Next.js','WordPress','Webflow','Nuxt','Shopify','HTML'][Math.floor(Math.random()*6)]);
    setDetecting(false);
  };

  const addKw = (e) => {
    if (e.key==='Enter' && form.kwInput.trim()) { upd('keywords',[...form.keywords, form.kwInput.trim()]); upd('kwInput',''); }
  };

  const COUNTRIES = [['CM','🇨🇲 Cameroun'],['SN','🇸🇳 Sénégal'],["CI","🇨🇮 Côte d'Ivoire"],['GH','🇬🇭 Ghana'],['NG','🇳🇬 Nigeria'],['KE','🇰🇪 Kenya'],['ET','🇪🇹 Ethiopia'],['TZ','🇹🇿 Tanzania'],['RW','🇷🇼 Rwanda'],['SA','🇸🇦 Saudi Arabia'],['CN','🇨🇳 China'],['BR','🇧🇷 Brazil'],['IN','🇮🇳 India'],['JP','🇯🇵 Japan'],['DE','🇩🇪 Germany'],['FR','🇫🇷 France'],['US','🇺🇸 USA'],['GB','🇬🇧 UK'],['CA','🇨🇦 Canada'],['TR','🇹🇷 Turkey'],['VN','🇻🇳 Vietnam']];
  const SL = { display:'flex', flexDirection:'column', gap:18, width:'100%', maxWidth:500 };
  const inputSt = { width:'100%', background:C.slate, border:`1px solid ${C.rule}`, color:C.paper, padding:'10px 14px', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'DM Mono,monospace' };
  const selSt = { ...inputSt, cursor:'pointer' };

  return (
    <div dir={isRTL?'rtl':'ltr'} style={{ background:C.ink, minHeight:'100vh', color:C.paper, fontFamily:'DM Mono,monospace', display:'flex', flexDirection:'column' }}>
      <div style={{ background:C.slate, padding:'14px clamp(16px,4vw,32px)', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`2px solid ${C.acid}`, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:20, fontWeight:900, color:C.acid, letterSpacing:3 }}>VELTRO</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:C.ghost }}>{step+1}/{steps.length}</span>
          <LangPicker />
        </div>
      </div>
      <div style={{ background:C.rule, height:3 }}><div style={{ background:C.acid, height:'100%', width:`${pct}%`, transition:'width 0.4s' }}/></div>
      <div style={{ padding:'6px clamp(16px,4vw,32px)', display:'flex', borderBottom:`1px solid ${C.rule}`, overflowX:'auto' }}>
        {steps.map((s,i) => (
          <div key={i} style={{ flex:1, textAlign:'center', fontSize:9, color:i===step?C.acid:i<step?C.green:C.ghost, textTransform:'uppercase', letterSpacing:0.8, minWidth:60, padding:'2px 0' }}>
            {i<step?'✓ ':''}{s}
          </div>
        ))}
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'clamp(16px,3vw,32px)' }}>
        {step===0 && (
          <div style={SL}>
            <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>{t('account_title')}</h1>
            <Field label={t('name_label')}><Input value={form.name} onChange={e=>upd('name',e.target.value)} placeholder="Ray Kuate Konga"/></Field>
            <Field label={t('email_label')}><Input type="email" value={form.email} onChange={e=>upd('email',e.target.value)} placeholder="you@company.com"/></Field>
            <Field label={t('password_label')}><Input type="password" value={form.password} onChange={e=>upd('password',e.target.value)} placeholder="8+"/></Field>
            <Field label={t('phone_label')} hint={t('phone_hint')}><Input type="tel" value={form.phone} onChange={e=>upd('phone',e.target.value)} placeholder="+237 600 000 000"/></Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label={t('country_label')}>
                <select value={form.country} onChange={e=>upd('country',e.target.value)} style={selSt}>
                  {COUNTRIES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label={t('lang_label')}>
                <select value={form.lang} onChange={e=>{ upd('lang',e.target.value); setLocale(e.target.value.toLowerCase()); }} style={selSt}>
                  {SUPPORTED_LOCALES.map(l => <option key={l} value={l.toUpperCase()}>{LOCALE_META[l]?.flag} {l.toUpperCase()}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
        {step===1 && (
          <div style={SL}>
            <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>{t('domain_title')}</h1>
            <Field label={t('domain_label')} hint={t('domain_hint')}>
              <Input value={form.domain} onChange={e=>upd('domain',e.target.value)} onBlur={()=>detectStack(form.domain)} placeholder="whisperience.com"/>
            </Field>
            {detecting && <div style={{ fontSize:12, color:C.amber }}>⟳ {t('detecting')}</div>}
            {detectedStack && !detecting && (
              <div style={{ background:`${C.green}15`, border:`1px solid ${C.green}44`, padding:'12px 16px', fontSize:12, color:C.green }}>
                ✓ {t('stack_detected',{stack:detectedStack,confidence:'94'})}
              </div>
            )}
          </div>
        )}
        {step===2 && (
          <div style={SL}>
            <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>{t('stack_title')}</h1>
            <Field label={t('biz_type_label')} hint={t('biz_type_hint')}><Input value={form.businessType} onChange={e=>upd('businessType',e.target.value)} placeholder={t('biz_type_hint')}/></Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label={t('revenue_goal')}><input type="number" value={form.revenueGoal} onChange={e=>upd('revenueGoal',+e.target.value)} style={inputSt}/></Field>
              <Field label={t('aov_label')}><input type="number" value={form.aov} onChange={e=>upd('aov',+e.target.value)} style={inputSt}/></Field>
            </div>
            <Field label={t('keywords_label')} hint={t('keywords_hint')}>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, background:C.slate, border:`1px solid ${C.rule}`, padding:'8px 12px', minHeight:50 }}>
                {form.keywords.map((k,i) => (
                  <span key={i} style={{ background:C.ink, color:C.acid, fontSize:11, padding:'3px 10px', display:'flex', alignItems:'center', gap:6 }}>
                    {k}<span style={{ cursor:'pointer', color:C.ghost }} onClick={()=>upd('keywords',form.keywords.filter((_,j)=>j!==i))}>×</span>
                  </span>
                ))}
                <input value={form.kwInput} onChange={e=>upd('kwInput',e.target.value)} onKeyDown={addKw}
                  placeholder={form.keywords.length===0?t('keywords_hint'):'+'}
                  style={{ background:'none', border:'none', color:C.paper, fontSize:12, outline:'none', flex:1, minWidth:80, fontFamily:'inherit' }}/>
              </div>
            </Field>
          </div>
        )}
        {step===3 && (
          <div style={SL}>
            <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>{t('gsc_title')}</h1>
            <div style={{ background:C.slate, border:`1px solid ${C.rule}`, padding:'14px 18px', fontSize:12, color:'#9B9BA0', lineHeight:1.8 }}>{t('gsc_desc')}</div>
            <Btn full onClick={()=>setStep(s=>s+1)}>🔍 {t('gsc_cta')}</Btn>
            <Btn variant="ghost" onClick={()=>setStep(s=>s+1)}>{t('gsc_skip')}</Btn>
          </div>
        )}
        {step===4 && (
          <div style={SL}>
            <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>{t('ga4_title')}</h1>
            <div style={{ fontSize:12, color:'#9B9BA0', lineHeight:1.8 }}>{t('ga4_desc')}</div>
            <Field label={t('ga4_property')} hint={t('ga4_hint')}><Input placeholder="123456789"/></Field>
            <Btn variant="ghost" onClick={()=>setStep(s=>s+1)}>{t('ga4_skip')}</Btn>
          </div>
        )}
        {step===5 && (
          <div style={SL}>
            <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>{t('plan_title')}</h1>
            {PLANS.map(p => (
              <div key={p.id} onClick={()=>upd('plan',p.id)}
                style={{ background:form.plan===p.id?C.slate:'#0F0F11', border:`2px solid ${form.plan===p.id?C.acid:C.rule}`,
                  padding:'14px 18px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:form.plan===p.id?C.acid:C.paper }}>{p.id}</div>
                  <div style={{ fontSize:11, color:C.ghost, marginTop:2 }}>{p.features.slice(0,2).join(' · ')}</div>
                </div>
                <div style={{ fontSize:19, fontWeight:900, color:C.acid }}>{p.mo?`$${p.mo}/mo`:p.lt?`$${p.lt}`:'—'}</div>
              </div>
            ))}
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:11, color:C.ghost, textTransform:'uppercase', letterSpacing:1.5, marginBottom:10 }}>{t('pay_method')}</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {PAY_METHODS.map(([id,label]) => (
                  <button key={id} onClick={()=>upd('payMethod',id)}
                    style={{ padding:'8px 12px', background:form.payMethod===id?`${C.acid}22`:C.rule,
                      border:`1px solid ${form.payMethod===id?C.acid:'transparent'}`,
                      color:form.payMethod===id?C.acid:C.ghost, fontSize:11, cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {step===6 && (
          <div style={{ display:'flex', flexDirection:'column', gap:22, alignItems:'center', textAlign:'center', maxWidth:400, width:'100%' }}>
            <div style={{ fontSize:54 }}>🎯</div>
            <h1 style={{ fontSize:24, fontWeight:900, margin:0, color:C.acid }}>{t('done_title')}</h1>
            <p style={{ fontSize:13, color:'#9B9BA0', lineHeight:1.8, margin:0 }}>{t('done_desc',{wa:form.phone?t('done_wa'):''})}</p>
            <Btn onClick={onDone}>{t('done_cta')} →</Btn>
          </div>
        )}
      </div>

      {step<6 && (
        <div style={{ padding:'14px clamp(16px,4vw,32px)', borderTop:`1px solid ${C.rule}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Btn variant="secondary" onClick={()=>setStep(s=>Math.max(0,s-1))} small>← {t('back')}</Btn>
          <Btn onClick={()=>setStep(s=>s+1)} small>{t('next')} →</Btn>
        </div>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function RevenueDashboard() {
  const { t } = useI18n();
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('all');
  const total = MOCK_ACTIONS.reduce((s,a)=>s+a.annual,0);
  const quick = MOCK_ACTIONS.slice(0,3).reduce((s,a)=>s+a.annual,0);
  const filtered = MOCK_ACTIONS.filter(a=>tab==='all'?true:tab==='auto'?a.auto:!a.auto);

  return (
    <div style={{ background:C.ink, minHeight:'100vh', color:C.paper, fontFamily:'DM Mono,monospace' }}>
      <div style={{ background:C.slate, padding:'14px clamp(16px,4vw,32px)', borderBottom:`2px solid ${C.acid}`,
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div>
          <span style={{ fontSize:20, fontWeight:900, color:C.acid, letterSpacing:3 }}>VELTRO</span>
          <span style={{ fontSize:11, color:C.ghost, marginLeft:12 }}>{t('dash_title')} · whisperience.com</span>
        </div>
        <LangPicker/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', borderBottom:`1px solid ${C.rule}` }}>
        {[
          {label:t('dash_upside'),   val:`$${(total/1000).toFixed(0)}K`,              color:C.acid},
          {label:t('dash_quickwin'), val:`$${(quick/1000).toFixed(0)}K`,              color:C.green},
          {label:t('dash_found'),    val:MOCK_ACTIONS.length,                          color:C.amber},
          {label:t('dash_auto'),     val:MOCK_ACTIONS.filter(a=>a.auto).length,        color:C.purple},
        ].map((s,i) => (
          <div key={i} style={{ padding:'clamp(14px,2vw,22px) clamp(14px,2vw,26px)', borderRight:`1px solid ${C.rule}`, background:'#0F0F11' }}>
            <div style={{ fontSize:9, color:C.ghost, textTransform:'uppercase', letterSpacing:2, marginBottom:5 }}>{s.label}</div>
            <div style={{ fontSize:'clamp(24px,3vw,38px)', fontWeight:900, color:s.color, lineHeight:1 }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:sel?'1fr clamp(280px,30vw,380px)':'1fr' }}>
        <div style={{ padding:'clamp(16px,3vw,28px) clamp(16px,3vw,32px)', overflowX:'auto' }}>
          <div style={{ display:'flex', marginBottom:16, borderBottom:`1px solid ${C.rule}` }}>
            {(['all','auto','manual']).map(tb => (
              <button key={tb} onClick={()=>setTab(tb)}
                style={{ padding:'8px clamp(10px,2vw,18px)', background:'none', border:'none',
                  borderBottom:`2px solid ${tab===tb?C.acid:'transparent'}`,
                  color:tab===tb?C.acid:C.ghost, fontSize:10, textTransform:'uppercase',
                  letterSpacing:1.5, cursor:'pointer', marginBottom:-1, fontFamily:'inherit', whiteSpace:'nowrap' }}>
                {tb==='all'?`${t('dash_all')} (${MOCK_ACTIONS.length})`:tb==='auto'?`${t('dash_autotab')} (${MOCK_ACTIONS.filter(a=>a.auto).length})`:`${t('dash_manual')} (${MOCK_ACTIONS.filter(a=>!a.auto).length})`}
              </button>
            ))}
          </div>
          {filtered.map((a,i) => (
            <div key={i} onClick={()=>setSel(sel?.keyword===a.keyword?null:a)}
              style={{ background:sel?.keyword===a.keyword?C.slate:'#0F0F11', border:`1px solid ${sel?.keyword===a.keyword?C.acid:C.rule}`,
                padding:'clamp(10px,2vw,14px) clamp(12px,2vw,18px)', marginBottom:8, cursor:'pointer',
                display:'grid', gridTemplateColumns:'24px 1fr auto auto auto', gap:'clamp(8px,1.5vw,12px)', alignItems:'center' }}>
              <div style={{ width:22, height:22, background:a.priority===1?C.red:C.amber, color:C.paper, fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{a.priority}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:3 }}>{a.keyword}</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <span style={{ fontSize:9, background:C.rule, color:'#9B9BA0', padding:'2px 6px' }}>{a.type.replace(/_/g,' ')}</span>
                  {a.auto && <span style={{ fontSize:9, background:`${C.purple}22`, color:C.purple, padding:'2px 6px' }}>⚡ Auto</span>}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:9, color:C.ghost, marginBottom:2 }}>{t('dash_annual')}</div>
                <div style={{ fontSize:'clamp(16px,2vw,20px)', fontWeight:900, color:C.acid }}>${(a.annual/1000).toFixed(0)}K</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:9, color:C.ghost, marginBottom:2 }}>{t('dash_monthly')}</div>
                <div style={{ fontSize:'clamp(13px,1.5vw,15px)', fontWeight:700, color:C.amber }}>${a.monthly.toLocaleString()}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:9, color:C.ghost, marginBottom:2 }}>{t('dash_effort')}</div>
                <div style={{ fontSize:12, color:'#9B9BA0' }}>{a.effort}</div>
              </div>
            </div>
          ))}
        </div>

        {sel && (
          <div style={{ borderLeft:`1px solid ${C.rule}`, padding:'clamp(16px,2vw,24px) clamp(14px,2vw,22px)',
            background:'#0F0F11', position:'sticky', top:0, maxHeight:'100vh', overflowY:'auto' }}>
            <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:C.ghost, cursor:'pointer', fontSize:12, marginBottom:14, fontFamily:'inherit' }}>← {t('back')}</button>
            <div style={{ fontSize:15, fontWeight:700, lineHeight:1.3, marginBottom:5 }}>{sel.keyword}</div>
            <div style={{ background:C.slate, border:`1px solid ${C.acid}`, padding:'12px 16px', marginBottom:16 }}>
              <div style={{ fontSize:9, color:C.ghost, marginBottom:3 }}>{t('dash_annual').toUpperCase()}</div>
              <div style={{ fontSize:34, fontWeight:900, color:C.acid }}>${sel.annual.toLocaleString()}</div>
              <div style={{ fontSize:11, color:'#9B9BA0', marginTop:3 }}>${sel.monthly.toLocaleString()}/mo · {sel.effort}</div>
            </div>
            <div style={{ fontSize:12, color:'#C8D0D8', lineHeight:1.7, marginBottom:16 }}>{sel.explain}</div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:9, color:C.ghost, textTransform:'uppercase', letterSpacing:2, marginBottom:7 }}>{t('dash_evidence')}</div>
              {sel.evidence.map((e,i) => (
                <div key={i} style={{ fontSize:11, color:'#9B9BA0', padding:'5px 0', borderBottom:`1px solid ${C.rule}`, display:'flex', gap:8 }}>
                  <span style={{ color:C.acid, flexShrink:0 }}>→</span>{e}
                </div>
              ))}
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:9, color:C.ghost, textTransform:'uppercase', letterSpacing:2, marginBottom:7 }}>{t('dash_implement')}</div>
              {sel.plan.map((s,i) => (
                <div key={i} style={{ fontSize:11, color:'#9B9BA0', padding:'7px 0', borderBottom:`1px solid ${C.rule}`, display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ background:C.rule, color:C.acid, width:17, height:17, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>{i+1}</span>
                  {s}
                </div>
              ))}
            </div>
            {sel.auto
              ? <Btn full onClick={()=>{}}>{t('dash_deploy')}</Btn>
              : <Btn full variant="secondary" onClick={()=>{}}>{t('dash_download')}</Btn>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
function VeltroInner() {
  const [view, setView] = useState('landing');
  return (
    <>
      {view==='landing'   && <LandingPage onSignup={()=>setView('onboard')} onPricing={()=>setView('pricing')}/>}
      {view==='pricing'   && <PricingPage onSelect={()=>setView('onboard')} onBack={()=>setView('landing')}/>}
      {view==='onboard'   && <OnboardWizard onDone={()=>setView('dashboard')}/>}
      {view==='dashboard' && <RevenueDashboard/>}
    </>
  );
}

export default function VeltroApp() {
  return (
    <I18nProvider>
      <VeltroInner/>
    </I18nProvider>
  );
}
