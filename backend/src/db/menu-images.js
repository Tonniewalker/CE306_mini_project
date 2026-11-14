// ลิงก์รูปเมนูตัวอย่างจาก Wikimedia Commons

// สร้างลิงก์รูปจากชื่อไฟล์บน Commons
function commonsImage(fileName, width = 640) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=${width}`;
}

// รูปของแต่ละเมนู (จับคู่ด้วยชื่อ)
const MENU_IMAGES = [
  { like: '%กะเพรา%', url: commonsImage('Kraphao_moo.jpg') },
  { like: '%ผัดไทย%', url: commonsImage('Phat_Thai_kung_Chang_Khien_street_stall.jpg') },
  { like: '%มันไก่%', url: commonsImage('2013_Khao_man_kai_Chiang_Mai.jpg') },
  { like: 'ข้าวผัด%', url: commonsImage('Koh_Mak,_Thailand,_Fried_rice_with_seafood,_Thai_fried_rice.jpg') },
  { like: 'ก๋วยเตี๋ยว%', url: commonsImage('Thai_noodle_soup,_Khao_Yai,_Thailand.jpg') },
];

// หารูปจากชื่อเมนู
function imageForName(name) {
  const toRegex = (like) => new RegExp('^' + like.replace(/%/g, '.*') + '$');
  const found = MENU_IMAGES.find((m) => toRegex(m.like).test(name));
  return found ? found.url : null;
}

module.exports = { MENU_IMAGES, imageForName, commonsImage };
