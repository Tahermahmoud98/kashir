const fs = require('fs');
let kbd = fs.readFileSync('locales/kbd.js', 'utf8');

const newTranslations = {
  'عامة': 'گشتی',
  'ألبان وأجبان': 'شیرەمەنی و پەنیر',
  'معلبات': 'لەقوتونراو',
  'مشروبات وعصائر': 'خواردنەوە و شەربەت',
  'لحوم ودواجن': 'گۆشت و مریشک',
  'خضار وفواكه': 'سەوزە و میوە',
  'مخبوزات وحلويات': 'نانه و شیرینی',
  'بهارات وعطارة': 'بەهارات',
  'منظفات': 'پاککەرەوەکان',
  'عناية شخصية': 'چاودێری کەسی',
  'مستلزمات أطفال': 'پێداویستی منداڵان',
  'وجبات خفيفة وشيبس': 'سووکە ژەم و چپس',
  'أدوات منزلية': 'کەلوپەلی ناوماڵ',
  'قرطاسية': 'قرتاسیە'
};

let trMatch = kbd.match(/translations:\s*\{/);
if (trMatch) {
  let startIndex = trMatch.index;
  let bracketCount = 0;
  let endIndex = -1;
  for (let i = startIndex + trMatch[0].length - 1; i < kbd.length; i++) {
    if (kbd[i] === '{') bracketCount++;
    if (kbd[i] === '}') bracketCount--;
    if (bracketCount === 0) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex !== -1) {
    let toInject = '';
    for (let [ar, ku] of Object.entries(newTranslations)) {
      if (!kbd.includes('"' + ar + '"')) {
        toInject += `    "${ar}": "${ku}",\n`;
      }
    }
    if (toInject) {
      kbd = kbd.slice(0, endIndex) + ',\n' + toInject + kbd.slice(endIndex);
      fs.writeFileSync('locales/kbd.js', kbd);
      console.log('Translations added successfully.');
    } else {
      console.log('Translations already exist.');
    }
  }
}
