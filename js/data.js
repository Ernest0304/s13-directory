/* =============================================================================
 * data.js — SINGLE SOURCE OF TRUTH for the S13 Kitchen Directory kiosk.
 *
 *   I18N       — every UI string in English + 中文
 *   SEED_UNITS — the twelve units with no tenants: the start-up fallback only
 *   FLOORPLAN  — the designed map geometry, traced from the real S13 layout
 *
 * The tenants themselves live in the database (edited in admin.html, and kept in
 * line with the rent roll by the hourly sync), never in this file.
 * ========================================================================== */

const FACILITY = {
  brand:   { en: "KitchenBASE", zh: "KitchenBASE" },
  site:    "S13",
  address: { en: "Bedok Food City", zh: "勿洛美食城" },
};

/* ---- UI copy, English + 中文 ------------------------------------------------ */
const I18N = {
  directory:      { en: "Kitchen Directory",      zh: "厨房商家指南" },
  touchToBegin:   { en: "TOUCH TO BEGIN",         zh: "触摸屏幕开始" },
  tapAnywhere:    { en: "Tap anywhere to start",  zh: "点击任意位置开始" },
  startOver:      { en: "Start Over",             zh: "重新开始" },
  youAreHere:     { en: "YOU ARE HERE",           zh: "您在这里" },
  unit:           { en: "UNIT",                   zh: "单位" },
  floorPlan:      { en: "Floor Plan",             zh: "平面图" },
  entrance:       { en: "Entrance",               zh: "入口" },
  k1k2Entrance:   { en: "K-01 / K-02 entrance",   zh: "K-01／K-02 入口" },
  loadingBay:     { en: "Loading Bay",            zh: "卸货区" },
  carPark:        { en: "Car Park",               zh: "停车场" },
  dryStore:       { en: "Dry Store",              zh: "干货仓" },
  toilet:         { en: "Toilet",                 zh: "洗手间" },
  matWash:        { en: "Mat Wash",               zh: "地垫清洗间" },
  selectPrompt:   { en: "Tap a kitchen — on the map or in the list", zh: "点击厨房——地图或列表均可" },
  pickToStart:    { en: "Pick a kitchen to light up its route", zh: "选择厨房以显示路线" },
  open:           { en: "Open",                   zh: "营业中" },
  closed:         { en: "Closed",                 zh: "已打烊" },
  kitchensWord:   { en: "kitchens",               zh: "间厨房" },
  kitchenWord:    { en: "kitchen",                zh: "间厨房" },
  needHelp:       { en: "Need help? Just ask any staff member.", zh: "需要帮助？请询问任何工作人员。" },
  noneInCat:      { en: "No kitchens in this category", zh: "此分类暂无厨房" },
  noneAtAll:      { en: "No kitchens to show right now", zh: "暂时没有可显示的厨房" },
  showAll:        { en: "Show all kitchens",      zh: "显示全部厨房" },
  comingSoon:     { en: "Coming soon",            zh: "即将入驻" },
  mapHint:        { en: "Tap a kitchen to see the way · drag to turn the map", zh: "点击厨房查看路线 · 拖动可旋转地图" },
  recentre:       { en: "Reset map",              zh: "地图复位" },
  available:      { en: "Vacant",                 zh: "空置" },
  availableTag:   { en: "Vacant unit",            zh: "空置单位" },
  leaseEnquiry:   { en: "No kitchen is operating in this unit.", zh: "此单位目前没有厨房营业。" },
  idleWarn:       { en: "Still looking? Touch the screen to stay", zh: "还在看吗？触摸屏幕即可继续" },
  idleBack:       { en: "Back to the start in {s} s",  zh: "{s} 秒后返回首页" },
  moreRows:       { en: "{n} more below",         zh: "下方还有 {n} 间" },
};

/* ---- FALLBACK line-up — used only when the board starts with no database answer and
 * no saved copy. It holds no tenants on purpose: twelve empty units are better than a
 * directory of restaurants that do not exist. (supabase/schema.sql creates the same rows.) */
const SEED_UNITS = ["K01", "K02", "K03", "K04", "K05", "K06", "K07", "K08", "K09", "K10", "K11", "K12"].map((id) => ({
  id, unit: id.replace("K", "K-"), occupied: false,
  name: { en: "", zh: "" }, cuisine: { en: "", zh: "" }, tagline: { en: "", zh: "" },
  cat: "", color: "#8A93A4", icon: "🍽️", hours: { open: "", close: "" }, hasHours: false,
}));

/* ---- cuisine filter groups (the chips above the kitchen row) ---- */
const CATEGORIES = [
  { key: "all",     icon: "🍽️", label: { en: "All", zh: "全部" } },
  { key: "western", icon: "🍔", label: { en: "Western", zh: "西餐" } },
  { key: "asian",   icon: "🍜", label: { en: "Asian", zh: "亚洲菜" } },
  { key: "world",   icon: "🌮", label: { en: "World", zh: "环球美食" } },
  { key: "healthy", icon: "🥗", label: { en: "Healthy", zh: "健康轻食" } },
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
    vX: 286, vY0: 64,  vY1: 510,      // left vertical corridor (serves K-05/K-04; stops at the lower corridor)
    lY: 510, lX0: 280, lX1: 745,      // lower corridor (above K-02/K-01; ends just past the walkway beside K-01)
    spurX: 1017,                       // entrance spur (kiosk up to main corridor)
    rightX: 1110,                      // "right-then-down" walkway: kiosk out to the right, then down to the front (around the car park)
    midX: 689, midY0: 44, midY1: 258,  // small walkway between K-09 and K-10 (holds the back door)
    frontY: 762, frontX0: 713, frontX1: 1110,   // bottom/front corridor: walkway-beside-K01 -> down the right side to the kiosk
    k1k2X: 728, k1k2Y0: 510, k1k2Y1: 762,        // vertical walkway BESIDE K-01 (lower corridor down to the K1&2 entrance)
  },

  kiosk:    { x: 1017, y: 580 },       // the "You are here" kiosk marker (small white box)
  entrance: { x: 1017, y: 712 },
  k1k2:     { x: 728, y: 770 },        // the "K1 & 2 only" bottom entrance (foot of the walkway beside K-01)

  // unit footprints (x, y, w, h) + which corridor they face
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

  // service rooms (from the real plan / Ernest's sketch): toilets + mat wash
  // stacked in a column, dry store opposite across the entrance corridor
  service: [
    { x: 898, y: 290, w: 94, h: 58, key: "toilet" },
    { x: 898, y: 352, w: 94, h: 58, key: "toilet" },
    { x: 898, y: 414, w: 94, h: 58, key: "matWash" },
    { x: 1046, y: 290, w: 92, h: 58, key: "dryStore" },
    { x: 796, y: 540, w: 140, h: 200, key: "loadingBay" },
    { x: 962, y: 648, w: 110, h: 92, key: "carPark" },
  ],

  // doorways drawn as a swing symbol (hinge x,y; w = leaf length; rot = open angle°)
  doors: [
    { x: 678, y: 118, w: 22, rot: 90 },      // back door inside the K-09/K-10 walkway
    { x: 706, y: 612, w: 44, rot: 90 },      // K1 & 2 entrance (on the walkway beside K-01, mid-height)
    { x: 342, y: 492, w: 36, rot: 180 },     // door on the lower corridor separating the main kitchens from the K-01/K-02 zone
    { x: 996, y: 505, w: 42, rot: 90 },      // lobby door on the entrance spur, just above the "you are here" kiosk
  ],

  // the entrance lobby (open area on the right where the kiosk stands)
  lobby: { x: 950, y: 528, w: 234, h: 212 },
};
