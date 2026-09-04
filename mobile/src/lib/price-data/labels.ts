/**
 * Nomi dei prodotti del catalogo, in tutte le lingue dell'app.
 *
 * PERCHÉ SERVE
 * ------------
 * Catalogo prezzi e motore pasti locale sono in inglese: la lista mostrava
 * "Mushrooms" a un utente italiano, e la ricerca del prezzo reale cercava
 * "Mushrooms" su Google Shopping Italia, da cui tornavano funghi essiccati
 * d'importazione e integratori.
 *
 * IL CLIENTE VUOLE L'APP FUORI DALL'ITALIA, quindi le etichette esistono per
 * tutte e cinque le lingue supportate, non solo per l'italiano. Un utente
 * francese vede "Champignons" e la ricerca parte in francese.
 *
 * Le voci italiane sono scritte a mano come le userebbe una persona sulla
 * lista della spesa ("Passata di pomodoro", non "Salsa di pomodoro"); le
 * altre lingue vengono dalla tassonomia Open Food Facts.
 *
 * GENERATO — rigenerare se il catalogo cambia.
 * 120 prodotti · it 120 · fr 56 · es 53 · de 52
 */

export type LabelLang = "en" | "it" | "fr" | "es" | "de";

type Labels = { en: string } & Partial<Record<LabelLang, string>>;

/** Chiave del catalogo → etichette per lingua. */
const LABELS: Record<string, Labels> = {
  almonds: {"en": "Almonds", "it": "Mandorle", "fr": "Amandes", "es": "Almendras", "de": "Mandeln"},
  apples: {"en": "Apples", "it": "Mele", "fr": "Pommes", "es": "Manzanas", "de": "Äpfel"},
  asparagus: {"en": "Asparagus", "it": "Asparagi", "fr": "Asperge", "es": "Espárrago", "de": "Spargel"},
  avocado: {"en": "Avocado", "it": "Avocado", "fr": "Avocat", "es": "Aguacate", "de": "Avocado"},
  bacon: {"en": "Bacon", "it": "Pancetta", "fr": "Bacon", "es": "Panceta", "de": "Speck"},
  balsamic_vinegar: {"en": "Balsamic vinegar", "it": "Aceto balsamico", "fr": "Vinaigre balsamique", "es": "Aceto balsámico", "de": "Balsamessig"},
  bananas: {"en": "Bananas", "it": "Banane", "fr": "Bananes", "es": "Plátanos", "de": "Bananen"},
  basmati_rice: {"en": "Basmati rice", "it": "Riso basmati", "fr": "Riz basmati", "es": "Arroz basmati", "de": "Basmatireis"},
  beef_mince: {"en": "Beef mince", "it": "Macinato di manzo", "fr": "Bœuf haché", "es": "Carne picada", "de": "Rinderhackfleisch"},
  beef_steak: {"en": "Beef steak", "it": "Bistecca di manzo", "fr": "Steak de bœuf", "es": "Bistec de ternera", "de": "Rindersteak"},
  bell_peppers: {"en": "Bell peppers", "it": "Peperoni", "fr": "Poivrons", "es": "Pimientos", "de": "Paprika"},
  black_beans: {"en": "Black beans", "it": "Fagioli neri", "fr": "Haricots noirs", "es": "Alubias negras", "de": "Schwarze Bohnen"},
  black_pepper: {"en": "Black pepper", "it": "Pepe nero", "fr": "Poivre noir", "es": "Pimienta negra", "de": "Schwarzer Pfeffer"},
  blueberries: {"en": "Blueberries", "it": "Mirtilli", "fr": "Myrtilles", "es": "Arándanos", "de": "Blaubeeren"},
  broccoli: {"en": "Broccoli", "it": "Broccoli", "fr": "Brocoli", "es": "Brócoli", "de": "Brokkoli"},
  bulgur: {"en": "Bulgur wheat", "it": "Bulgur", "fr": "Boulgour", "es": "Bulgur", "de": "Bulgur"},
  butter: {"en": "Butter", "it": "Burro", "fr": "Beurre", "es": "Mantequilla", "de": "Butter"},
  cabbage: {"en": "Cabbage", "it": "Cavolo", "fr": "Chou", "es": "Col", "de": "Kohl"},
  canned_tomatoes: {"en": "Canned tomatoes", "it": "Pomodori pelati", "fr": "Tomates en conserve", "es": "Tomate triturado", "de": "Dosentomaten"},
  capers: {"en": "Capers", "it": "Capperi", "fr": "Câpre", "es": "Alcaparras", "de": "Kapern"},
  carrots: {"en": "Carrots", "it": "Carote", "fr": "Carottes", "es": "Zanahorias", "de": "Karotten"},
  carrots_celery: {"en": "Carrots & celery", "it": "Carote e sedano", "fr": "Carottes et céleri", "es": "Zanahorias y apio", "de": "Suppengrün"},
  cauliflower: {"en": "Cauliflower", "it": "Cavolfiore", "fr": "Chou-fleur", "es": "Coliflor", "de": "Blumenkohl"},
  celery: {"en": "Celery", "it": "Sedano", "fr": "Céleri", "es": "Apio", "de": "Sellerie"},
  cereal: {"en": "Breakfast cereal", "it": "Cereali da colazione", "fr": "Céréales", "es": "Cereales", "de": "Müsli"},
  cheddar: {"en": "Cheddar cheese", "it": "Formaggio", "fr": "Cheddar", "es": "Queso cheddar", "de": "Cheddar"},
  cherry_tomatoes: {"en": "Cherry tomatoes", "it": "Pomodorini", "fr": "Tomates cerises", "es": "Tomates cherry", "de": "Cherrytomaten"},
  chicken_breast: {"en": "Chicken breast", "it": "Petto di pollo", "fr": "Blanc de poulet", "es": "Pechuga de pollo", "de": "Hähnchenbrust"},
  chicken_thighs: {"en": "Chicken thighs", "it": "Cosce di pollo", "fr": "Cuisses de poulet", "es": "Muslos de pollo", "de": "Hähnchenschenkel"},
  chickpeas: {"en": "Chickpeas", "it": "Ceci", "fr": "Pois chiches", "es": "Garbanzos", "de": "Kichererbsen"},
  cinnamon: {"en": "Cinnamon", "it": "Cannella", "fr": "Cannelle", "es": "Canela", "de": "Zimt"},
  coffee: {"en": "Coffee", "it": "Caffè", "fr": "Café", "es": "Café", "de": "Kaffee"},
  corn: {"en": "Sweetcorn", "it": "Mais", "fr": "Maïs doux", "es": "Maíz dulce", "de": "Süßmais"},
  couscous: {"en": "Couscous", "it": "Couscous", "fr": "Couscous", "es": "Cuscús", "de": "Couscous"},
  cream: {"en": "Cooking cream", "it": "Panna da cucina", "fr": "Crème liquide", "es": "Nata", "de": "Sahne"},
  cucumber: {"en": "Cucumber", "it": "Cetrioli", "fr": "Concombre", "es": "Pepino", "de": "Gurke"},
  dried_herbs: {"en": "Dried herbs", "it": "Erbe secche", "fr": "Herbes de Provence", "es": "Hierbas secas", "de": "Getrocknete Kräuter"},
  eggplant: {"en": "Eggplant", "it": "Melanzane", "fr": "Aubergine", "es": "Berenjena", "de": "Aubergine"},
  eggs: {"en": "Eggs", "it": "Uova", "fr": "Œufs", "es": "Huevos", "de": "Eier"},
  feta: {"en": "Feta cheese", "it": "Feta", "fr": "Feta", "es": "Queso feta", "de": "Feta"},
  flour: {"en": "Flour", "it": "Farina", "fr": "Farine", "es": "Harina", "de": "Mehl"},
  free_range_chicken: {"en": "Free-range chicken", "it": "Pollo ruspante", "fr": "Poulet élevé en plein air", "es": "Pollo de corral", "de": "Freilandhühner"},
  fresh_herbs: {"en": "Fresh herbs", "it": "Erbe aromatiche", "fr": "Herbes fraîches", "es": "Hierbas frescas", "de": "Frische Kräuter"},
  garlic: {"en": "Garlic", "it": "Aglio", "fr": "Ail", "es": "Ajo", "de": "Knoblauch"},
  granola: {"en": "Granola", "it": "Granola", "fr": "Granola", "es": "Granola", "de": "Granola"},
  grapes: {"en": "Grapes", "it": "Uva", "fr": "Raisin", "es": "Uvas", "de": "Weintrauben"},
  greek_yogurt: {"en": "Greek yogurt", "it": "Yogurt greco", "fr": "Yaourt grec", "es": "Yogur griego", "de": "Griechischer Joghurt"},
  green_beans: {"en": "Green beans", "it": "Fagiolini", "fr": "Haricots verts", "es": "Judías verdes", "de": "Grüne Bohnen"},
  ham: {"en": "Sliced ham", "it": "Prosciutto cotto", "fr": "Jambon blanc", "es": "Jamón de York", "de": "Kochschinken"},
  honey: {"en": "Honey", "it": "Miele", "fr": "Miel", "es": "Miel", "de": "Honig"},
  jam: {"en": "Jam", "it": "Marmellata", "fr": "Confiture", "de": "Konfitüre", "es": "Mermelada"},
  kale: {"en": "Kale", "it": "Cavolo nero", "fr": "Chou frisé", "es": "Col rizada", "de": "Grünkohl"},
  ketchup: {"en": "Ketchup", "it": "Ketchup", "fr": "Ketchup", "es": "Kétchup", "de": "Ketchup"},
  kidney_beans: {"en": "Kidney beans", "it": "Fagioli rossi", "fr": "Haricots rouges", "es": "Alubias rojas", "de": "Kidneybohnen"},
  leek: {"en": "Leek", "it": "Porri", "fr": "Poireau", "es": "Puerro", "de": "Lauch"},
  lemons: {"en": "Lemons", "it": "Limoni", "fr": "Citrons", "es": "Limones", "de": "Zitronen"},
  mayo: {"en": "Mayonnaise", "it": "Maionese", "fr": "Mayonnaise", "es": "Mayonesa", "de": "Mayonnaise"},
  melon: {"en": "Melon", "it": "Melone", "fr": "Melon", "es": "Melón", "de": "Melone"},
  milk: {"en": "Milk", "it": "Latte", "fr": "Lait", "es": "Leche", "de": "Milch"},
  mixed_nuts: {"en": "Mixed nuts", "it": "Frutta secca", "fr": "Mélange de noix", "es": "Frutos secos", "de": "Nussmischung"},
  mozzarella: {"en": "Mozzarella", "it": "Mozzarella", "fr": "Mozzarella", "es": "Mozzarella", "de": "Mozzarella"},
  mushrooms: {"en": "Mushrooms", "it": "Funghi", "fr": "Champignons", "es": "Champiñones", "de": "Pilze"},
  mustard: {"en": "Mustard", "it": "Senape", "fr": "Moutarde", "es": "Mostaza", "de": "Senf"},
  noodles: {"en": "Noodles", "it": "Noodles", "fr": "Nouilles", "es": "Fideos", "de": "Nudeln"},
  oats: {"en": "Oats", "it": "Fiocchi d'avena", "fr": "Flocons d'avoine", "es": "Avena", "de": "Haferflocken"},
  olive_oil: {"en": "Extra virgin olive oil", "it": "Olio extravergine di oliva", "fr": "Huile d'olive extra vierge", "es": "Aceite de oliva virgen extra", "de": "Natives Olivenöl Extra"},
  olives: {"en": "Olives", "it": "Olive", "fr": "Olives", "es": "Aceitunas", "de": "Oliven"},
  onions: {"en": "Onions", "it": "Cipolle", "fr": "Oignons", "es": "Cebollas", "de": "Zwiebeln"},
  onions_garlic: {"en": "Onions & garlic", "it": "Cipolle e aglio", "fr": "Ail et oignons", "es": "Ajo y cebollas", "de": "Zwiebeln & Knoblauch"},
  oranges: {"en": "Oranges", "it": "Arance", "fr": "Oranges", "es": "Naranjas", "de": "Orangen"},
  paprika: {"en": "Paprika", "it": "Paprika", "fr": "Paprika", "es": "Pimentón", "de": "Paprikapulver"},
  parmesan: {"en": "Parmesan", "it": "Parmigiano", "fr": "Parmesan", "es": "Parmisano", "de": "Parmesan"},
  pasta: {"en": "Pasta", "it": "Pasta", "fr": "Pâtes alimentaires", "es": "Pastas alimenticias", "de": "Teigwaren"},
  peaches: {"en": "Peaches", "it": "Pesche", "fr": "Pêches", "es": "Melocotones", "de": "Pfirsiche"},
  peanut_butter: {"en": "Peanut butter", "it": "Burro di arachidi", "fr": "Beurre d'arachide", "es": "Crema de cacahuete", "de": "Erdnussbutter"},
  pears: {"en": "Pears", "it": "Pere", "fr": "Poires", "es": "Peras", "de": "Birnen"},
  peas: {"en": "Peas", "it": "Piselli", "fr": "Petits pois", "es": "Guisantes", "de": "Erbsen"},
  pesto: {"en": "Pesto", "it": "Pesto", "fr": "Sauce pesto", "es": "Pesto", "de": "Pesto"},
  pita: {"en": "Pita bread", "it": "Pane pita", "fr": "Pain pita", "es": "Pan de pita", "de": "Fladenbrot"},
  pizza_flour: {"en": "Pizza flour", "it": "Farina per pizza", "fr": "Farine à pizza", "es": "Harina de fuerza", "de": "Pizzamehl"},
  pork_loin: {"en": "Pork loin", "it": "Lonza di maiale", "fr": "Longe de porc", "es": "Lomo de cerdo", "de": "Schweinelende"},
  potatoes: {"en": "Potatoes", "it": "Patate", "fr": "Pommes de terre", "es": "Patatas", "de": "Kartoffeln"},
  prawns: {"en": "Prawns", "it": "Gamberetti", "fr": "Crevettes", "es": "Gambas", "de": "Garnelen"},
  quinoa: {"en": "Quinoa", "it": "Quinoa", "fr": "Quinoa", "es": "Quinoa", "de": "Quinoa"},
  raspberries: {"en": "Raspberries", "it": "Lamponi", "fr": "Framboises", "es": "Frambuesas", "de": "Himbeeren"},
  red_lentils: {"en": "Red lentils", "it": "Lenticchie rosse", "fr": "Lentilles corail", "es": "Lentejas rojas", "de": "Rote Linsen"},
  rice: {"en": "Rice", "it": "Riso", "fr": "Riz", "es": "Arroz", "de": "Reis"},
  ricotta: {"en": "Ricotta", "it": "Ricotta", "fr": "Ricotta", "es": "Requesón", "de": "Ricotta"},
  rocket: {"en": "Rocket", "it": "Rucola", "fr": "Roquette", "es": "Rúcula", "de": "Rucola"},
  salad_greens: {"en": "Mixed salad greens", "it": "Insalata mista", "fr": "Mélange de salade", "es": "Ensalada variada", "de": "Mischsalat"},
  salmon_fillet: {"en": "Salmon fillets", "it": "Filetto di salmone", "fr": "Pavés de saumon", "es": "Salmón (filetes)", "de": "Lachsfilet"},
  salt: {"en": "Salt", "it": "Sale", "fr": "Sel", "es": "Sal", "de": "Speisesalz"},
  sausages: {"en": "Sausages", "it": "Salsicce", "fr": "Saucisses", "es": "Salchichas", "de": "Würstchen"},
  seasonal_veg: {"en": "Seasonal veg pack", "it": "Verdure di stagione", "fr": "Légumes de saison", "es": "Verdura de temporada", "de": "Saisonales Gemüse"},
  seeds: {"en": "Mixed seeds", "it": "Semi misti", "fr": "Graines", "es": "Semillas", "de": "Kerne"},
  sourdough: {"en": "Sourdough loaf", "it": "Pane a lievitazione naturale", "fr": "Pain au levain", "es": "Pan de masa madre", "de": "Sauerteigbrot"},
  soy_sauce: {"en": "Soy sauce", "it": "Salsa di soia", "fr": "Sauce au soja", "es": "Salsa de soya", "de": "Sojasauce"},
  spices: {"en": "Mixed spices", "it": "Spezie", "fr": "Mélange d'épices", "es": "Mezcla de especias", "de": "Gemischte Gewürze"},
  spinach: {"en": "Spinach", "it": "Spinaci", "fr": "Épinard", "es": "Espinacas", "de": "Spinat"},
  stock_cubes: {"en": "Stock cubes", "it": "Dado", "fr": "Bouillon", "es": "Pastillas de caldo", "de": "Brühwürfel"},
  strawberries: {"en": "Strawberries", "it": "Fragole", "fr": "Fraises", "es": "Fresas", "de": "Erdbeeren"},
  sugar: {"en": "Sugar", "it": "Zucchero", "fr": "Sucre", "es": "Azúcar", "de": "Zucker"},
  sunflower_oil: {"en": "Sunflower oil", "it": "Olio di semi", "fr": "Huile de tournesol", "es": "Aceite de girasol", "de": "Sonnenblumenöl"},
  sweet_potatoes: {"en": "Sweet potatoes", "it": "Patate dolci", "fr": "Patates douces", "es": "Batatas", "de": "Süßkartoffeln"},
  tahini: {"en": "Tahini", "it": "Tahina", "fr": "Crème de sésame", "es": "Tahini", "de": "Tahina"},
  tea: {"en": "Tea bags", "it": "Tè", "fr": "Thé", "es": "Té", "de": "Tee"},
  tofu: {"en": "Tofu", "it": "Tofu", "fr": "Tofu", "es": "Tofu", "de": "Tofu"},
  tomato_sauce: {"en": "Tomato sauce", "it": "Passata di pomodoro", "fr": "Sauce tomate", "es": "Salsa de tomate", "de": "Tomatensauce"},
  tomatoes: {"en": "Tomatoes", "it": "Pomodori", "fr": "Tomates", "es": "Tomates", "de": "Tomaten"},
  tortillas: {"en": "Tortillas", "it": "Piadine", "fr": "Tortillas", "es": "Tortillas", "de": "Tortillas"},
  tuna_can: {"en": "Canned tuna", "it": "Tonno in scatola", "fr": "Thon en conserve", "es": "Atun en conserva", "de": "Thunfischkonserve"},
  vinegar: {"en": "Vinegar", "it": "Aceto", "fr": "Vinaigre", "es": "Vinagre", "de": "Essig"},
  walnuts: {"en": "Walnuts", "it": "Noci", "fr": "Noix", "es": "Nueces", "de": "Walnüsse"},
  watermelon: {"en": "Watermelon", "it": "Anguria", "fr": "Pastèque", "es": "Sandía", "de": "Wassermelone"},
  white_bread: {"en": "White bread", "it": "Pane", "fr": "Pain blanc", "es": "Pan blanco", "de": "Weißbrot"},
  white_fish: {"en": "White fish fillets", "it": "Filetto di merluzzo", "fr": "Cabillaud", "es": "Merluza", "de": "Seelachsfilet"},
  whole_chicken: {"en": "Whole chicken", "it": "Pollo intero", "fr": "Poulet entier", "es": "Pollo entero", "de": "Ganzes Hähnchen"},
  wholegrain_bread: {"en": "Wholegrain bread", "it": "Pane integrale", "fr": "Pain complet", "es": "Pan integral", "de": "Vollkornbrot"},
  yogurt: {"en": "Natural yogurt", "it": "Yogurt", "fr": "Yaourt nature", "es": "Yogur natural", "de": "Naturjoghurt"},
  zucchini: {"en": "Zucchini", "it": "Zucchine", "fr": "Courgettes", "es": "Calabacín", "de": "Zucchini"},
};

/** Nome inglese normalizzato → chiave del catalogo. */
const KEY_BY_EN: Record<string, string> = {
  "almonds": "almonds",
  "apples": "apples",
  "asparagus": "asparagus",
  "avocado": "avocado",
  "bacon": "bacon",
  "balsamic vinegar": "balsamic_vinegar",
  "bananas": "bananas",
  "basmati rice": "basmati_rice",
  "beef mince": "beef_mince",
  "beef steak": "beef_steak",
  "bell peppers": "bell_peppers",
  "black beans": "black_beans",
  "black pepper": "black_pepper",
  "blueberries": "blueberries",
  "breakfast cereal": "cereal",
  "broccoli": "broccoli",
  "bulgur wheat": "bulgur",
  "butter": "butter",
  "cabbage": "cabbage",
  "canned tomatoes": "canned_tomatoes",
  "canned tuna": "tuna_can",
  "capers": "capers",
  "carrots": "carrots",
  "carrots   celery": "carrots_celery",
  "cauliflower": "cauliflower",
  "celery": "celery",
  "cheddar cheese": "cheddar",
  "cherry tomatoes": "cherry_tomatoes",
  "chicken breast": "chicken_breast",
  "chicken thighs": "chicken_thighs",
  "chickpeas": "chickpeas",
  "cinnamon": "cinnamon",
  "coffee": "coffee",
  "cooking cream": "cream",
  "couscous": "couscous",
  "cucumber": "cucumber",
  "dried herbs": "dried_herbs",
  "eggplant": "eggplant",
  "eggs": "eggs",
  "extra virgin olive oil": "olive_oil",
  "feta cheese": "feta",
  "flour": "flour",
  "free range chicken": "free_range_chicken",
  "fresh herbs": "fresh_herbs",
  "garlic": "garlic",
  "granola": "granola",
  "grapes": "grapes",
  "greek yogurt": "greek_yogurt",
  "green beans": "green_beans",
  "honey": "honey",
  "jam": "jam",
  "kale": "kale",
  "ketchup": "ketchup",
  "kidney beans": "kidney_beans",
  "leek": "leek",
  "lemons": "lemons",
  "mayonnaise": "mayo",
  "melon": "melon",
  "milk": "milk",
  "mixed nuts": "mixed_nuts",
  "mixed salad greens": "salad_greens",
  "mixed seeds": "seeds",
  "mixed spices": "spices",
  "mozzarella": "mozzarella",
  "mushrooms": "mushrooms",
  "mustard": "mustard",
  "natural yogurt": "yogurt",
  "noodles": "noodles",
  "oats": "oats",
  "olives": "olives",
  "onions": "onions",
  "onions   garlic": "onions_garlic",
  "oranges": "oranges",
  "paprika": "paprika",
  "parmesan": "parmesan",
  "pasta": "pasta",
  "peaches": "peaches",
  "peanut butter": "peanut_butter",
  "pears": "pears",
  "peas": "peas",
  "pesto": "pesto",
  "pita bread": "pita",
  "pizza flour": "pizza_flour",
  "pork loin": "pork_loin",
  "potatoes": "potatoes",
  "prawns": "prawns",
  "quinoa": "quinoa",
  "raspberries": "raspberries",
  "red lentils": "red_lentils",
  "rice": "rice",
  "ricotta": "ricotta",
  "rocket": "rocket",
  "salmon fillets": "salmon_fillet",
  "salt": "salt",
  "sausages": "sausages",
  "seasonal veg pack": "seasonal_veg",
  "sliced ham": "ham",
  "sourdough loaf": "sourdough",
  "soy sauce": "soy_sauce",
  "spinach": "spinach",
  "stock cubes": "stock_cubes",
  "strawberries": "strawberries",
  "sugar": "sugar",
  "sunflower oil": "sunflower_oil",
  "sweet potatoes": "sweet_potatoes",
  "sweetcorn": "corn",
  "tahini": "tahini",
  "tea bags": "tea",
  "tofu": "tofu",
  "tomato sauce": "tomato_sauce",
  "tomatoes": "tomatoes",
  "tortillas": "tortillas",
  "vinegar": "vinegar",
  "walnuts": "walnuts",
  "watermelon": "watermelon",
  "white bread": "white_bread",
  "white fish fillets": "white_fish",
  "whole chicken": "whole_chicken",
  "wholegrain bread": "wholegrain_bread",
  "zucchini": "zucchini",
};

function norm(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Etichetta di un prodotto nella lingua richiesta.
 *
 * Accetta sia la chiave del catalogo sia il nome inglese. Se la lingua non
 * ha una traduzione si ricade sull'inglese, che è sempre presente: meglio
 * "Mushrooms" a un utente tedesco che una riga vuota.
 *
 * Restituisce `null` per un nome che il catalogo non conosce — tipicamente
 * una voce generata dall'AI — così il chiamante può tenersi l'originale,
 * che è già nella lingua dell'utente.
 */
export function productLabel(nameOrKey: string, lang: LabelLang = "en"): string | null {
  if (!nameOrKey) return null;
  const key = LABELS[nameOrKey] ? nameOrKey : KEY_BY_EN[norm(nameOrKey)];
  if (!key) return null;
  const entry = LABELS[key];
  return entry[lang] ?? entry.en;
}

/** Reparti del catalogo, per lingua. */
const CATEGORIES: Record<string, Partial<Record<LabelLang, string>>> = {
  Proteins: { it: "Proteine", fr: "Protéines", es: "Proteínas", de: "Proteine" },
  Vegetables: { it: "Frutta e verdura", fr: "Fruits et légumes", es: "Frutas y verduras", de: "Obst und Gemüse" },
  Fruit: { it: "Frutta", fr: "Fruits", es: "Frutas", de: "Obst" },
  Dairy: { it: "Latticini", fr: "Produits laitiers", es: "Lácteos", de: "Milchprodukte" },
  Carbohydrates: { it: "Pane e cereali", fr: "Pain et céréales", es: "Pan y cereales", de: "Brot und Getreide" },
  "Healthy Fats": { it: "Condimenti", fr: "Matières grasses", es: "Aceites y grasas", de: "Fette und Öle" },
  Pantry: { it: "Dispensa", fr: "Épicerie", es: "Despensa", de: "Vorratskammer" },
  Snacks: { it: "Snack", fr: "En-cas", es: "Aperitivos", de: "Snacks" },
  Drinks: { it: "Bevande", fr: "Boissons", es: "Bebidas", de: "Getränke" },
  Other: { it: "Altro", fr: "Autre", es: "Otros", de: "Sonstiges" },
};

export function categoryLabel(category: string, lang: LabelLang = "en"): string {
  return CATEGORIES[category]?.[lang] ?? category;
}
