/* =============================================================================
 * data.js — SINGLE SOURCE OF TRUTH for the S13 Kitchen Directory kiosk.
 *
 * Edit this file to update the board:
 *   I18N      — every UI string in English + 中文
 *   KITCHENS  — the 12 brands (bilingual) mapped to their unit on the plan
 *   FLOORPLAN — the designed map geometry, traced from the real S13 layout
 *
 * Brands are PLACEHOLDERS; swap in the real S13 tenants (both languages, and a
 * logo at img/<id>.png if you want logos instead of the emoji marks).
 * ========================================================================== */

const FACILITY = {
  brand:   { en: "SMART CITY KITCHENS", zh: "智慧城市厨房" },
  site:    "S13",
  address: { en: "Bedok Food City", zh: "勿洛美食城" },
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
  loadingBay:     { en: "Loading Bay",            zh: "卸货区" },
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

/* ---- SEED line-up — bundled default content (used until Supabase is wired,  */
/* and as the offline fallback). The live content is served from the database  */
/* via db.js; this is also what supabase/schema.sql seeds the units table with. */
const SEED_UNITS = [
  { id: "K03", unit: "K-03", type: "Large",    sqft: 321, color: "#E4572E", icon: "🔥", cat: "western", hours: { open: "11:00", close: "22:00" },
    name: { en: "Smoke & Barrel", zh: "烟桶烧烤" }, cuisine: { en: "American BBQ", zh: "美式烧烤" }, tagline: { en: "Low and slow, all day", zh: "慢火细烤，全天供应" } },
  { id: "K04", unit: "K-04", type: "Large",    sqft: 332, color: "#C1440E", icon: "🍕", cat: "western", hours: { open: "11:00", close: "22:30" },
    name: { en: "Pizza Forno", zh: "火窑披萨" }, cuisine: { en: "Wood-fired Pizza", zh: "柴火披萨" }, tagline: { en: "Blistered in 90 seconds", zh: "九十秒出炉" } },
  { id: "K05", unit: "K-05", type: "Large",    sqft: 332, color: "#E6A700", icon: "🍗", cat: "western", hours: { open: "11:00", close: "22:00" },
    name: { en: "Cluck & Co", zh: "咔滋炸鸡" }, cuisine: { en: "Fried Chicken", zh: "炸鸡" }, tagline: { en: "Crunch you can hear", zh: "听得见的酥脆" } },
  { id: "K06", unit: "K-06", type: "Large",    sqft: 373, color: "#B23A48", icon: "🍔", cat: "western", hours: { open: "11:00", close: "22:00" },
    name: { en: "Burger Yard", zh: "汉堡庭院" }, cuisine: { en: "Smash Burgers", zh: "现煎汉堡" }, tagline: { en: "Always double stacked", zh: "双层管饱" } },
  { id: "K07", unit: "K-07", type: "Large",    sqft: 373, color: "#D7263D", icon: "🍛", cat: "world", hours: { open: "11:00", close: "22:00" },
    name: { en: "Bombay Express", zh: "孟买快线" }, cuisine: { en: "North Indian", zh: "印度菜" }, tagline: { en: "Spice, made to order", zh: "现做香料咖喱" } },
  { id: "K08", unit: "K-08", type: "Standard", sqft: 219, color: "#F2A900", icon: "🍜", cat: "asian", hours: { open: "10:00", close: "21:30" },
    name: { en: "Noodle Theory", zh: "面道" }, cuisine: { en: "Asian Noodles", zh: "亚洲面食" }, tagline: { en: "Hand-pulled, served hot", zh: "手工拉面，热气腾腾" } },
  { id: "K09", unit: "K-09", type: "Standard", sqft: 296, color: "#E08D2F", icon: "🌮", cat: "world", hours: { open: "11:00", close: "22:00" },
    name: { en: "Taco Libre", zh: "自由塔可" }, cuisine: { en: "Mexican", zh: "墨西哥菜" }, tagline: { en: "Street tacos, no passport", zh: "街头塔可，无需护照" } },
  { id: "K10", unit: "K-10", type: "Standard", sqft: 189, color: "#2E86AB", icon: "🍣", cat: "asian", hours: { open: "11:30", close: "21:30" },
    name: { en: "Sushi Den", zh: "寿司殿" }, cuisine: { en: "Japanese", zh: "日本料理" }, tagline: { en: "Rolled to order", zh: "现卷现做" } },
  { id: "K11", unit: "K-11", type: "Standard", sqft: 191, color: "#C0392B", icon: "🥢", cat: "asian", hours: { open: "11:00", close: "22:00" },
    name: { en: "Wok This Way", zh: "镬气小厨" }, cuisine: { en: "Chinese", zh: "中式小炒" }, tagline: { en: "Breath of the wok", zh: "十足镬气" } },
  { id: "K12", unit: "K-12", type: "Standard", sqft: 167, color: "#8C6A4A", icon: "☕", cat: "sweets", hours: { open: "07:30", close: "19:00" },
    name: { en: "The Daily Grind", zh: "每日研磨" }, cuisine: { en: "Coffee & Brunch", zh: "咖啡早午餐" }, tagline: { en: "Your morning, sorted", zh: "开启美好早晨" } },
  { id: "K02", unit: "K-02", type: "Cold",     sqft: 272, color: "#3BA776", icon: "🥗", cat: "healthy", hours: { open: "10:00", close: "21:00" },
    name: { en: "Green Bowl", zh: "轻食碗" }, cuisine: { en: "Salads & Bowls", zh: "沙拉轻食" }, tagline: { en: "Eat the rainbow", zh: "缤纷蔬食" } },
  { id: "K01", unit: "K-01", type: "Cold",     sqft: 267, color: "#C76B98", icon: "🍰", cat: "sweets", hours: { open: "12:00", close: "23:00" },
    name: { en: "Sweet Lab", zh: "甜点实验室" }, cuisine: { en: "Desserts", zh: "甜品" }, tagline: { en: "Always save room", zh: "永远留点胃口" } },
];

/* ---- cuisine filter groups (the chips above the kitchen row) ---- */
const CATEGORIES = [
  { key: "all",     icon: "🍽️", label: { en: "All", zh: "全部" } },
  { key: "western", icon: "🍔", label: { en: "Western", zh: "西式" } },
  { key: "asian",   icon: "🍜", label: { en: "Asian", zh: "亚洲" } },
  { key: "world",   icon: "🌮", label: { en: "World", zh: "异国" } },
  { key: "healthy", icon: "🥗", label: { en: "Healthy", zh: "健康" } },
  { key: "sweets",  icon: "☕", label: { en: "Café & Sweets", zh: "咖啡甜点" } },
];

/* -----------------------------------------------------------------------------
 * FLOORPLAN — a clean, designed map TRACED from the real S13 plan.
 * Same arrangement as the drawing: 3 Large kitchens down the left, 5 Standard
 * along the top, 2 Large in the centre, 2 Cold at the lower-centre, with the
 * service rooms + entrance lobby (and this kiosk) on the right.
 *
 * Coordinates are in the SVG viewBox below. `face` says which corridor a unit
 * opens onto, so map.js can draw a clean walking route:
 *   down  = opens downward onto the main corridor (top row)
 *   up    = opens upward onto the main corridor (centre row)
 *   right = opens right onto the left vertical corridor (left column)
 *   lower = opens up onto the lower corridor (cold row)
 * -------------------------------------------------------------------------- */
const FLOORPLAN = {
  viewBox: { w: 1240, h: 800 },

  // corridor network (centre-lines + extents) — the route runs along these
  corridor: {
    hY: 258, hX0: 268, hX1: 1120,    // main horizontal corridor
    vX: 286, vY0: 64,  vY1: 496,      // left vertical corridor (serves K-05/K-04; stops at lower corridor)
    lY: 496, lX0: 184, lX1: 840,      // lower corridor (serves K-03 + the cold row)
    spurX: 1017,                       // entrance spur (kiosk up to main corridor)
    dropX: 835,                        // drop point to reach the lower corridor
    midX: 689, midY0: 44, midY1: 258,  // small walkway between K-09 and K-10 (holds the back door)
    frontY: 762, frontX0: 760, frontX1: 1017,   // bottom/front corridor: kiosk -> K1&2 entrance (past Loading Bay)
    k1k2X: 786, k1k2Y0: 496, k1k2Y1: 762,        // vertical walkway BESIDE K-01 (lower corridor down to the K1&2 entrance)
  },

  kiosk:    { x: 1017, y: 650 },       // the "You are here" point (right lobby)
  entrance: { x: 1017, y: 712 },
  k1k2:     { x: 786, y: 772 },        // the "K1 & 2 only" bottom entrance (foot of the walkway beside K-01)

  // unit footprints (x, y, w, h) + which corridor they face
  units: {
    K05: { x: 56,   y: 44,  w: 214, h: 186, face: "right" },
    K04: { x: 56,   y: 294, w: 214, h: 178, face: "right" },
    K03: { x: 70,   y: 528, w: 246, h: 200, face: "lower" },
    K08: { x: 306,  y: 44,  w: 164, h: 186, face: "down"  },
    K09: { x: 492,  y: 44,  w: 186, h: 186, face: "down"  },
    K10: { x: 700,  y: 44,  w: 156, h: 186, face: "down"  },
    K11: { x: 874,  y: 44,  w: 156, h: 186, face: "down"  },
    K12: { x: 1048, y: 44,  w: 156, h: 186, face: "down"  },
    K06: { x: 320,  y: 294, w: 232, h: 168, face: "up"    },
    K07: { x: 574,  y: 294, w: 250, h: 168, face: "up"    },
    K02: { x: 330,  y: 528, w: 214, h: 200, face: "k1k2" },
    K01: { x: 544,  y: 528, w: 214, h: 200, face: "k1k2" },
  },

  // service rooms (from the real plan / Ernest's sketch): toilets + mat wash
  // stacked in a column, dry store opposite across the entrance corridor
  service: [
    { x: 898, y: 290, w: 94, h: 58, key: "toilet" },
    { x: 898, y: 352, w: 94, h: 58, key: "toilet" },
    { x: 898, y: 414, w: 94, h: 58, key: "matWash" },
    { x: 1046, y: 290, w: 92, h: 58, key: "dryStore" },
  ],

  // doorways drawn as a swing symbol (hinge x,y; w = leaf length; rot = open angle°)
  doors: [
    { x: 1000, y: 562, w: 34, rot: -90 },   // main entrance door (corridor <-> lobby, by "you are here")
    { x: 678, y: 118, w: 22, rot: 90 },      // back door inside the K-09/K-10 walkway
    { x: 764, y: 760, w: 44, rot: 90 },      // K1 & 2 bottom entrance (on the walkway beside K-01)
  ],

  // the entrance lobby (open area on the right where the kiosk stands)
  lobby: { x: 846, y: 528, w: 338, h: 200 },
};
