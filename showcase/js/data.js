/* =============================================================================
 * data.js — PUBLIC SHOWCASE build. Standalone, no backend.
 *
 * All 12 tenants below are FICTIONAL placeholder brands, invented purely to
 * demonstrate the board. They are not real Smart City Kitchens licensees and
 * carry no real logos — the map draws emoji marks instead. There is no admin,
 * no database, and no connection to any live system in this build.
 * ========================================================================== */

const FACILITY = {
  brand:   { en: "SMART CITY KITCHENS", zh: "智慧城市厨房" },
  site:    "Demo Facility",
  address: { en: "Cloud Kitchen Food City", zh: "云厨美食城" },
};

/* ---- UI copy, English + 中文 ------------------------------------------------ */
const I18N = {
  directory:      { en: "Kitchen Directory",      zh: "厨房指南" },
  touchToBegin:   { en: "TOUCH TO BEGIN",         zh: "触摸屏幕开始" },
  tapAnywhere:    { en: "Tap anywhere to start",  zh: "点击任意位置开始" },
  startOver:      { en: "Start Over",             zh: "重新开始" },
  youAreHere:     { en: "YOU ARE HERE",           zh: "您在这里" },
  unit:           { en: "UNIT",                   zh: "单元" },
  floorPlan:      { en: "Floor Plan",             zh: "平面图" },
  entrance:       { en: "Entrance",               zh: "入口" },
  k1k2Entrance:   { en: "K1 & 2 entrance",        zh: "K1 & 2 入口" },
  loadingBay:     { en: "loading bay",            zh: "卸货区" },
  carPark:        { en: "car park",               zh: "停车场" },
  dryStore:       { en: "Dry Store",              zh: "干货仓" },
  toilet:         { en: "Toilet",                 zh: "洗手间" },
  matWash:        { en: "Mat Wash",               zh: "洗垫间" },
  selectPrompt:   { en: "Tap a kitchen — on the map or below", zh: "点击厨房——地图或下方卡片" },
  pickToStart:    { en: "Pick a kitchen to light up its route", zh: "选择厨房以显示路线" },
  open:           { en: "Open",                   zh: "营业中" },
  closed:         { en: "Closed",                 zh: "已打烊" },
  kitchensWord:   { en: "kitchens",               zh: "间厨房" },
  needHelp:       { en: "Need help? Just ask any staff member.", zh: "需要帮助？请询问任何工作人员。" },
  orderAhead:     { en: "Order ahead at the counter", zh: "可在柜台提前点餐" },
  noneInCat:      { en: "No kitchens in this category", zh: "此分类暂无厨房" },
  available:      { en: "Available",              zh: "待租" },
  availableTag:   { en: "AVAILABLE",              zh: "招租中" },
  leaseEnquiry:   { en: "This unit is available — enquire at the management office.", zh: "此单元招租中——详情请咨询管理处。" },
};

/* ---- FICTIONAL tenants — invented brands, for demonstration only ---------- */
const SEED_UNITS = [
  { id: "K01", unit: "K-01", color: "#C76B98", icon: "🧁", cat: "sweets",  hours: { open: "12:00", close: "23:00" },
    name: { en: "Sugar Lab", zh: "糖实验室" }, cuisine: { en: "Desserts & Bakes", zh: "甜品烘焙" }, tagline: { en: "Always save room", zh: "永远留点胃口" } },
  { id: "K02", unit: "K-02", color: "#3BA776", icon: "🥗", cat: "healthy", hours: { open: "10:00", close: "21:00" },
    name: { en: "Leaf & Ladle", zh: "叶与勺" }, cuisine: { en: "Salads & Grain Bowls", zh: "沙拉谷物碗" }, tagline: { en: "Eat the rainbow", zh: "缤纷蔬食" } },
  { id: "K03", unit: "K-03", color: "#E4572E", icon: "🍔", cat: "western", hours: { open: "11:00", close: "22:00" },
    name: { en: "Patty Parade", zh: "汉堡巡游" }, cuisine: { en: "Smash Burgers", zh: "现煎汉堡" }, tagline: { en: "Always double stacked", zh: "双层管饱" } },
  { id: "K04", unit: "K-04", color: "#C1440E", icon: "🍕", cat: "western", hours: { open: "11:00", close: "22:30" },
    name: { en: "Slice Theory", zh: "切片理论" }, cuisine: { en: "Wood-fired Pizza", zh: "柴火披萨" }, tagline: { en: "Blistered in 90 seconds", zh: "九十秒出炉" } },
  { id: "K05", unit: "K-05", color: "#E6A700", icon: "🍗", cat: "western", hours: { open: "11:00", close: "22:00" },
    name: { en: "Cluckwork", zh: "咔嚓炸鸡" }, cuisine: { en: "Fried Chicken", zh: "炸鸡" }, tagline: { en: "Crunch you can hear", zh: "听得见的酥脆" } },
  { id: "K06", unit: "K-06", color: "#B23A48", icon: "🔥", cat: "western", hours: { open: "11:00", close: "22:00" },
    name: { en: "Char & Barrel", zh: "炭与桶" }, cuisine: { en: "American BBQ", zh: "美式烧烤" }, tagline: { en: "Low and slow, all day", zh: "慢火细烤，全天供应" } },
  { id: "K07", unit: "K-07", color: "#D7263D", icon: "🍛", cat: "world",   hours: { open: "11:00", close: "22:00" },
    name: { en: "Masala Junction", zh: "香料交汇" }, cuisine: { en: "North Indian", zh: "印度菜" }, tagline: { en: "Spice, made to order", zh: "现做香料咖喱" } },
  { id: "K08", unit: "K-08", color: "#F2A900", icon: "🍜", cat: "asian",   hours: { open: "10:00", close: "21:30" },
    name: { en: "Slurp Society", zh: "嗦面社" }, cuisine: { en: "Asian Noodles", zh: "亚洲面食" }, tagline: { en: "Hand-pulled, served hot", zh: "手工拉面，热气腾腾" } },
  { id: "K09", unit: "K-09", color: "#E08D2F", icon: "🌮", cat: "world",   hours: { open: "11:00", close: "22:00" },
    name: { en: "Taco Tectonic", zh: "塔可板块" }, cuisine: { en: "Mexican Street Food", zh: "墨西哥街头菜" }, tagline: { en: "Street tacos, no passport", zh: "街头塔可，无需护照" } },
  { id: "K10", unit: "K-10", color: "#2E86AB", icon: "🍣", cat: "asian",   hours: { open: "11:30", close: "21:30" },
    name: { en: "Sushi Circuit", zh: "寿司环线" }, cuisine: { en: "Japanese", zh: "日本料理" }, tagline: { en: "Rolled to order", zh: "现卷现做" } },
  { id: "K11", unit: "K-11", color: "#C0392B", icon: "🥢", cat: "asian",   hours: { open: "11:00", close: "22:00" },
    name: { en: "Wok Star", zh: "镬气之星" }, cuisine: { en: "Chinese Stir-fry", zh: "中式小炒" }, tagline: { en: "Breath of the wok", zh: "十足镬气" } },
  { id: "K12", unit: "K-12", color: "#8C6A4A", icon: "☕", cat: "sweets",  hours: { open: "07:30", close: "19:00" },
    name: { en: "Bean Machine", zh: "豆子机器" }, cuisine: { en: "Coffee & Brunch", zh: "咖啡早午餐" }, tagline: { en: "Your morning, sorted", zh: "开启美好早晨" } },
];

/* ---- cuisine filter groups ---- */
const CATEGORIES = [
  { key: "all",     icon: "🍽️", label: { en: "All", zh: "全部" } },
  { key: "western", icon: "🍔", label: { en: "Western", zh: "西式" } },
  { key: "asian",   icon: "🍜", label: { en: "Asian", zh: "亚洲" } },
  { key: "world",   icon: "🌮", label: { en: "World", zh: "异国" } },
  { key: "healthy", icon: "🥗", label: { en: "Healthy", zh: "健康" } },
  { key: "sweets",  icon: "☕", label: { en: "Café & Sweets", zh: "咖啡甜点" } },
];

/* ---- FLOORPLAN geometry (the designed S13-style layout) ---- */
const FLOORPLAN = {
  viewBox: { w: 1240, h: 800 },
  corridor: {
    hY: 258, hX0: 268, hX1: 1120,
    vX: 286, vY0: 64,  vY1: 510,
    lY: 510, lX0: 280, lX1: 745,
    spurX: 1017,
    rightX: 1110,
    midX: 689, midY0: 44, midY1: 258,
    frontY: 762, frontX0: 713, frontX1: 1110,
    k1k2X: 728, k1k2Y0: 510, k1k2Y1: 762,
  },
  kiosk:    { x: 1017, y: 580 },
  entrance: { x: 1017, y: 712 },
  k1k2:     { x: 728, y: 770 },
  units: {
    K05: { x: 50,   y: 44,  w: 214, h: 186, face: "right" },
    K04: { x: 50,   y: 294, w: 214, h: 178, face: "right" },
    K03: { x: 20,   y: 500, w: 240, h: 228, face: "lower" },
    K08: { x: 316,  y: 44,  w: 164, h: 186, face: "down"  },
    K09: { x: 492,  y: 44,  w: 186, h: 186, face: "down"  },
    K10: { x: 710,  y: 44,  w: 156, h: 186, face: "down"  },
    K11: { x: 874,  y: 44,  w: 156, h: 186, face: "down"  },
    K12: { x: 1048, y: 44,  w: 156, h: 186, face: "down"  },
    K06: { x: 320,  y: 288, w: 232, h: 168, face: "up"    },
    K07: { x: 574,  y: 288, w: 250, h: 168, face: "up"    },
    K02: { x: 282,  y: 548, w: 196, h: 192, face: "k1k2" },
    K01: { x: 500,  y: 548, w: 196, h: 192, face: "k1k2" },
  },
  service: [
    { x: 898, y: 290, w: 94, h: 58, key: "toilet" },
    { x: 898, y: 352, w: 94, h: 58, key: "toilet" },
    { x: 898, y: 414, w: 94, h: 58, key: "matWash" },
    { x: 1046, y: 290, w: 92, h: 58, key: "dryStore" },
    { x: 796, y: 540, w: 140, h: 200, key: "loadingBay" },
    { x: 962, y: 648, w: 110, h: 92, key: "carPark" },
  ],
  doors: [
    { x: 678, y: 118, w: 22, rot: 90 },
    { x: 706, y: 612, w: 44, rot: 90 },
    { x: 342, y: 492, w: 36, rot: 180 },
    { x: 996, y: 505, w: 42, rot: 90 },
  ],
  lobby: { x: 950, y: 528, w: 234, h: 212 },
};
