// Premium Restoration — languages: English, Spanish and Brazilian Portuguese.
//
// The page text itself is translated in the HTML (es/*.html, pt/*.html; see
// README "Languages"). This file holds every piece of text the site's
// JavaScript shows or sends: the chat assistant and its estimate, form
// messages, the 3D room's buttons and the PDF. Each entry is
//   key: [English, Spanish, Portuguese]
// with {name} placeholders filled in by t(). Keep the three in step: the
// unit tests fail when one is missing or its placeholders differ.
//
// The language is the page's own <html lang>, so the English pages (and the
// admin tool, which is English only) always get English.
//
// Loads as a plain browser script (window.I18n) and as a Node module.

(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.I18n = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LANGS = ["en", "es", "pt"];
  // Prices stay in US dollars in every language; only the number format
  // follows the language (US Spanish, Brazilian Portuguese).
  var LOCALES = { en: "en-US", es: "es-US", pt: "pt-BR" };
  var NAMES = { en: "English", es: "Español", pt: "Português" };

  var S = {
    // ---------- language switcher ----------
    "lang.label": ["Language", "Idioma", "Idioma"],

    // ---------- units ----------
    "unit.ft": ["ft", "pies", "pés"],
    "unit.sqft": ["sq ft", "pies²", "pés²"],
    "unit.sqftFloor": ["sq ft of floor", "pies² de piso", "pés² de piso"],
    "unit.unit": ["unit", "unidad", "unidade"],
    "unit.units": ["units", "unidades", "unidades"],
    "unit.point": ["point", "punto", "ponto"],
    "unit.points": ["points", "puntos", "pontos"],
    "unit.flat": ["flat", "fijo", "fixo"],
    "unit.gallon": ["gallon", "galón", "galão"],
    "unit.gallons": ["gallons", "galones", "galões"],

    // ---------- estimate: fixtures (js/bathroom-pricing.js) ----------
    "fixture.Toilet_Quantity": ["Toilet", "Inodoro", "Vaso sanitário"],
    "fixture.Sink_Quantity": ["Sink", "Lavabo", "Pia"],
    "fixture.Bathtub_Quantity": ["Bathtub", "Bañera", "Banheira"],
    "fixture.Shower_Quantity": ["Shower", "Ducha", "Chuveiro"],
    "fixture.Shower_Door_Quantity": ["Shower door", "Puerta de ducha", "Porta de box"],
    "fixture.Door_Quantity": ["Entry door", "Puerta de entrada", "Porta de entrada"],
    "fixture.Vanity_Quantity": ["Vanity", "Mueble de lavabo", "Gabinete de pia"],
    "fixture.Cabinet_Quantity": ["Cabinet", "Gabinete", "Armário"],
    "fixture.Mirror_Quantity": ["Mirror (standard)", "Espejo (estándar)", "Espelho (padrão)"],
    "fixture.Mirror_Huge_Quantity": ["Mirror (huge)", "Espejo (extragrande)", "Espelho (extragrande)"],
    "fixture.Shower_Shelf_Quantity": ["Shower shelf", "Repisa de ducha", "Nicho de box"],
    "fixtures.Toilet_Quantity": ["Toilets", "Inodoros", "Vasos sanitários"],
    "fixtures.Sink_Quantity": ["Sinks", "Lavabos", "Pias"],
    "fixtures.Bathtub_Quantity": ["Bathtubs", "Bañeras", "Banheiras"],
    "fixtures.Shower_Quantity": ["Showers", "Duchas", "Chuveiros"],
    "fixtures.Shower_Door_Quantity": ["Shower doors", "Puertas de ducha", "Portas de box"],
    "fixtures.Door_Quantity": ["Entry doors", "Puertas de entrada", "Portas de entrada"],
    "fixtures.Vanity_Quantity": ["Vanities", "Muebles de lavabo", "Gabinetes de pia"],
    "fixtures.Cabinet_Quantity": ["Cabinets", "Gabinetes", "Armários"],
    "fixtures.Mirror_Quantity": ["Standard mirrors", "Espejos estándar", "Espelhos padrão"],
    "fixtures.Mirror_Huge_Quantity": ["Huge mirrors", "Espejos extragrandes", "Espelhos extragrandes"],
    "fixtures.Shower_Shelf_Quantity": ["Shower shelves", "Repisas de ducha", "Nichos de box"],

    // ---------- estimate: work questions ----------
    "question.demolition": [
      "Remove the existing bathroom first (demolition)?",
      "¿Quitar primero el baño actual (demolición)?",
      "Remover o banheiro atual primeiro (demolição)?",
    ],
    "question.floorFinish": ["New floor?", "¿Piso nuevo?", "Piso novo?"],
    "question.walls": ["Walls?", "¿Paredes?", "Paredes?"],
    "question.paintCeiling": ["Paint the ceiling?", "¿Pintar el techo?", "Pintar o teto?"],
    "choice.yes": ["Yes", "Sí", "Sim"],
    "choice.no": ["No", "No", "Não"],
    "choice.floor.tile": ["Tile", "Azulejo", "Cerâmica"],
    "choice.floor.flooring": ["Other flooring", "Otro tipo de piso", "Outro tipo de piso"],
    "choice.walls.tile": ["Tile (full height)", "Azulejo (hasta el techo)", "Revestimento (até o teto)"],
    "choice.walls.paint": ["Paint", "Pintura", "Pintura"],
    "choice.none": ["None", "Ninguno", "Nenhum"],
    "choice.neither": ["Neither", "Ninguno", "Nenhum"],
    "choice.notAnswered": ["Not answered", "Sin respuesta", "Sem resposta"],
    "dimension.Bathroom_Width_Ft": ["Width", "Ancho", "Largura"],
    "dimension.Bathroom_Length_Ft": ["Length", "Largo", "Comprimento"],
    "dimension.Bathroom_Height_Ft": ["Ceiling height", "Altura del techo", "Altura do teto"],

    // ---------- estimate: validation ----------
    "error.chooseAnswer": ["Choose an answer.", "Elija una respuesta.", "Escolha uma resposta."],
    "error.dimension.missing.Bathroom_Width_Ft": [
      "Enter the width in feet (more than 0 and no more than {max} ft) — the work you chose is priced by area.",
      "Escriba el ancho en pies (más de 0 y no más de {max} pies): el trabajo que eligió se cobra por área.",
      "Informe a largura em pés (mais de 0 e no máximo {max} pés): o serviço escolhido é cobrado por área.",
    ],
    "error.dimension.missing.Bathroom_Length_Ft": [
      "Enter the length in feet (more than 0 and no more than {max} ft) — the work you chose is priced by area.",
      "Escriba el largo en pies (más de 0 y no más de {max} pies): el trabajo que eligió se cobra por área.",
      "Informe o comprimento em pés (mais de 0 e no máximo {max} pés): o serviço escolhido é cobrado por área.",
    ],
    "error.dimension.missing.Bathroom_Height_Ft": [
      "Enter the ceiling height in feet (more than 0 and no more than {max} ft) — the work you chose is priced by area.",
      "Escriba la altura del techo en pies (más de 0 y no más de {max} pies): el trabajo que eligió se cobra por área.",
      "Informe a altura do teto em pés (mais de 0 e no máximo {max} pés): o serviço escolhido é cobrado por área.",
    ],
    "error.dimension.range": [
      "{label} must be more than 0 and no more than {max} ft.",
      "{label}: debe ser más de 0 y no más de {max} pies.",
      "{label}: deve ser mais de 0 e no máximo {max} pés.",
    ],
    "error.wholeNumber": [
      "Enter a whole number from 0 to {max}.",
      "Escriba un número entero del 0 al {max}.",
      "Informe um número inteiro de 0 a {max}.",
    ],

    // ---------- estimate: priced lines ----------
    "line.detail": ["{qty} {unit} × {rate}", "{qty} {unit} × {rate}", "{qty} {unit} × {rate}"],
    "line.flatCharge": ["Flat charge", "Cargo fijo", "Valor fixo"],
    "section.preparation": ["Preparation", "Preparación", "Preparação"],
    "section.fixtures": ["Fixtures", "Instalaciones", "Instalações"],
    "section.surfaces": ["Surfaces", "Superficies", "Superfícies"],
    "section.plumbing": ["Plumbing", "Plomería", "Encanamento"],
    "section.electrical": ["Electrical", "Electricidad", "Elétrica"],
    "line.demolition": ["Demolition", "Demolición", "Demolição"],
    "line.floorTile": ["Floor tile", "Azulejo de piso", "Piso cerâmico"],
    "line.flooring": ["Flooring", "Piso", "Piso"],
    "line.wallTile": [
      "Wall tile (full height)",
      "Azulejo de pared (hasta el techo)",
      "Revestimento de parede (até o teto)",
    ],
    "line.wallPaint": ["Painting (walls)", "Pintura (paredes)", "Pintura (paredes)"],
    "line.ceilingPaint": ["Painting (ceiling)", "Pintura (techo)", "Pintura (teto)"],
    "line.plumbingPoints": ["Plumbing points", "Puntos de plomería", "Pontos hidráulicos"],
    "line.noStack": [
      "No existing plumbing stack",
      "Sin bajante de plomería existente",
      "Sem prumada hidráulica existente",
    ],
    "line.badValve": ["Bad valve replacement", "Cambio de válvula dañada", "Troca de registro com defeito"],
    "line.electricalPoints": ["Electrical points", "Puntos eléctricos", "Pontos elétricos"],

    // ---------- estimate: assumptions and summary ----------
    "scope.describe": [
      "Demolition: {demolition}; new floor: {floor}; walls: {walls}; paint ceiling: {ceiling}",
      "Demolición: {demolition}; piso nuevo: {floor}; paredes: {walls}; pintar el techo: {ceiling}",
      "Demolição: {demolition}; piso novo: {floor}; paredes: {walls}; pintar o teto: {ceiling}",
    ],
    "assume.scope": [
      "{scope}. Only this work is priced.",
      "{scope}. Solo se cotiza este trabajo.",
      "{scope}. Somente este serviço está no orçamento.",
    ],
    "assume.floorArea": [
      "Floor area: {w} × {l} ft = {area} sq ft (the ceiling is taken to be the same size).",
      "Área del piso: {w} × {l} pies = {area} pies² (se toma el techo del mismo tamaño).",
      "Área do piso: {w} × {l} pés = {area} pés² (considera-se o teto do mesmo tamanho).",
    ],
    "assume.wallArea": [
      "Wall area: 2 × {h} ft × ({w} + {l} ft) = {area} sq ft — all four walls, full height, with no deduction for doors, windows, or a tub/shower.",
      "Área de paredes: 2 × {h} pies × ({w} + {l} pies) = {area} pies²: las cuatro paredes, hasta el techo, sin descontar puertas, ventanas ni la bañera o ducha.",
      "Área das paredes: 2 × {h} pés × ({w} + {l} pés) = {area} pés²: as quatro paredes, até o teto, sem descontar portas, janelas nem a banheira ou o box.",
    ],
    "assume.fixtures": [
      "Fixtures are priced per item at our current labor rates, which may change.",
      "Las instalaciones se cobran por pieza según nuestras tarifas de mano de obra actuales, que pueden cambiar.",
      "As instalações são cobradas por item conforme nossos valores atuais de mão de obra, que podem mudar.",
    ],
    "summary.title": [
      "My bathroom estimate from your website:",
      "Mi estimación del baño hecha en su sitio web:",
      "Minha estimativa do banheiro feita no seu site:",
    ],
    "summary.room": ["- Room: {size}", "- Baño: {size}", "- Banheiro: {size}"],
    "summary.size2": [
      "{w} ft wide × {l} ft long",
      "{w} pies de ancho × {l} pies de largo",
      "{w} pés de largura × {l} pés de comprimento",
    ],
    "summary.size3": [
      "{w} ft wide × {l} ft long × {h} ft high",
      "{w} pies de ancho × {l} pies de largo × {h} pies de alto",
      "{w} pés de largura × {l} pés de comprimento × {h} pés de altura",
    ],
    "summary.work": ["- Work: {scope}", "- Trabajo: {scope}", "- Serviço: {scope}"],
    "summary.fixtures": ["- Fixtures: {list}", "- Instalaciones: {list}", "- Instalações: {list}"],
    "summary.none": ["none", "ninguna", "nenhuma"],
    "summary.total": [
      "- Estimated labor total: {total} — rough and non-binding; excludes plumbing, electrical, materials, permits and taxes.",
      "- Total estimado de mano de obra: {total}. Aproximado y no vinculante; no incluye plomería, electricidad, materiales, permisos ni impuestos.",
      "- Total estimado de mão de obra: {total}. Aproximado e sem compromisso; não inclui encanamento, elétrica, materiais, alvarás nem impostos.",
    ],
    "summary.totalBeforePlumbing": [
      "- Estimated labor total: {total} (before plumbing) — rough and non-binding; excludes plumbing, electrical, materials, permits and taxes.",
      "- Total estimado de mano de obra: {total} (sin la plomería). Aproximado y no vinculante; no incluye plomería, electricidad, materiales, permisos ni impuestos.",
      "- Total estimado de mão de obra: {total} (sem o encanamento). Aproximado e sem compromisso; não inclui encanamento, elétrica, materiais, alvarás nem impostos.",
    ],

    // ---------- chat assistant replies (js/chat-replies.js) ----------
    "chat.callForPrice": [
      "Call {phone} or use the Contact page for a price.",
      "Llame al {phone} o use la página de Contacto para pedir un precio.",
      "Ligue para {phone} ou use a página de Contato para pedir um preço.",
    ],
    "chat.estimateOffer": [
      "For a rough estimate of your whole job, tap the button below or say “bathroom quote”.",
      "Para una estimación aproximada de todo el trabajo, toque el botón de abajo o escriba “cotización del baño”.",
      "Para uma estimativa aproximada do serviço todo, toque no botão abaixo ou escreva “orçamento do banheiro”.",
    ],
    "chat.plumbingExtra": [
      "Installing it also needs plumbing work, which isn't included in our online prices and will add to the cost.",
      "Instalarlo también requiere trabajo de plomería, que no está incluido en nuestros precios en línea y aumentará el costo.",
      "A instalação também exige serviço de encanamento, que não está incluído nos nossos preços on-line e vai aumentar o custo.",
    ],
    "chat.identity": [
      "I'm an automated assistant with scripted replies — not a person, and not AI. Nothing you type here is sent to or read by us. To reach a person, call {phone} or email {email}.",
      "Soy un asistente automático con respuestas programadas: no soy una persona ni inteligencia artificial. Nada de lo que escriba aquí se nos envía ni lo leemos. Para hablar con una persona, llame al {phone} o escriba a {email}.",
      "Sou um assistente automático com respostas programadas: não sou uma pessoa nem inteligência artificial. Nada do que você digitar aqui é enviado ou lido por nós. Para falar com uma pessoa, ligue para {phone} ou escreva para {email}.",
    ],
    "chat.otherLanguage.es": [
      "This automated assistant also speaks Spanish: choose “Español” in the language menu at the top of the page, or call {phone}.",
      "Este asistente automático también habla español: elija “Español” en el menú de idioma, arriba en la página, o llame al {phone}.",
      "This automated assistant also speaks Spanish: choose “Español” in the language menu at the top of the page, or call {phone}.",
    ],
    "chat.otherLanguage.pt": [
      "This automated assistant also speaks Portuguese: choose “Português” in the language menu at the top of the page, or call {phone}.",
      "This automated assistant also speaks Portuguese: choose “Português” in the language menu at the top of the page, or call {phone}.",
      "Este assistente automático também fala português: escolha “Português” no menu de idioma, no topo da página, ou ligue para {phone}.",
    ],
    "chat.french": [
      "Sorry — this automated assistant only understands English, Spanish and Portuguese. Désolé, cet assistant automatique ne comprend que l'anglais, l'espagnol et le portugais. Please call {phone}.",
      "Lo sentimos, este asistente automático solo entiende español, inglés y portugués. Désolé, cet assistant automatique ne comprend que l'anglais, l'espagnol et le portugais. Llame al {phone}.",
      "Desculpe, este assistente automático só entende português, inglês e espanhol. Désolé, cet assistant automatique ne comprend que l'anglais, l'espagnol et le portugais. Ligue para {phone}.",
    ],
    "chat.damage": [
      "Sorry, we don't take on damage restoration (such as water, fire, smoke or mold damage), so we can't help with that. We only do bathroom restorations — for a bathroom project without damage, say “bathroom quote” and I can give you a rough estimate.",
      "Lo sentimos, no hacemos restauración de daños (como daños por agua, fuego, humo o moho), así que no podemos ayudarle con eso. Solo hacemos remodelaciones de baños: para un proyecto de baño sin daños, escriba “cotización del baño” y le daré una estimación aproximada.",
      "Desculpe, não fazemos restauração de danos (como danos causados por água, fogo, fumaça ou mofo), então não podemos ajudar com isso. Só fazemos reformas de banheiros: para um projeto de banheiro sem danos, escreva “orçamento do banheiro” e eu dou uma estimativa aproximada.",
    ],
    "chat.notBathroom": [
      "Sorry, we currently only take on bathroom restorations — not kitchens, exteriors, roofing, other rooms, or damage restoration — so we can't help with that. For a bathroom project, say “bathroom quote” and I can give you a rough estimate.",
      "Lo sentimos, por ahora solo hacemos remodelaciones de baños (no cocinas, exteriores, techos, otras habitaciones ni restauración de daños), así que no podemos ayudarle con eso. Para un proyecto de baño, escriba “cotización del baño” y le daré una estimación aproximada.",
      "Desculpe, no momento só fazemos reformas de banheiros (não cozinhas, áreas externas, telhados, outros cômodos nem restauração de danos), então não podemos ajudar com isso. Para um projeto de banheiro, escreva “orçamento do banheiro” e eu dou uma estimativa aproximada.",
    ],
    "chat.fixtureProblem": [
      "A leaking or broken faucet, toilet, sink, tub or shower is plumbing work. We can replace bathroom fixtures as part of a bathroom restoration, but plumbing isn't included in our online prices and adds to the cost, and we do not currently hold a contractor licence. Call {phone} to talk it through — we'll tell you who would do the plumbing and how it would be priced before any work is agreed. (We don't take on water-damage restoration.)",
      "Una llave, inodoro, lavabo, bañera o ducha con fugas o dañada es trabajo de plomería. Podemos cambiar las instalaciones del baño como parte de una remodelación, pero la plomería no está incluida en nuestros precios en línea y aumenta el costo, y por ahora no tenemos licencia de contratista. Llame al {phone} para hablarlo: le diremos quién haría la plomería y cómo se cobraría antes de acordar cualquier trabajo. (No hacemos restauración de daños por agua.)",
      "Torneira, vaso, pia, banheira ou chuveiro com vazamento ou quebrado é serviço de encanamento. Podemos trocar as peças do banheiro como parte de uma reforma, mas o encanamento não está incluído nos nossos preços on-line e aumenta o custo, e no momento não temos licença de empreiteiro. Ligue para {phone} para conversarmos: diremos quem faria o encanamento e como seria cobrado antes de combinar qualquer serviço. (Não fazemos restauração de danos causados por água.)",
    ],
    "chat.item.showerDoor": [
      "Shower door installation is {price} per door (labor only).",
      "La instalación de una puerta de ducha cuesta {price} por puerta (solo mano de obra).",
      "A instalação de porta de box custa {price} por porta (só mão de obra).",
    ],
    "chat.item.showerShelf": [
      "A built-in shower shelf is {price} each (labor only).",
      "Una repisa empotrada en la ducha cuesta {price} cada una (solo mano de obra).",
      "Um nicho embutido no box custa {price} cada (só mão de obra).",
    ],
    "chat.item.tile": [
      "Tile is {price} per sq ft of floor or wall tiled (labor only).",
      "El azulejo cuesta {price} por pie cuadrado de piso o pared (solo mano de obra).",
      "O revestimento cerâmico custa {price} por pé quadrado de piso ou parede (só mão de obra).",
    ],
    "chat.item.paint": [
      "Painting is {price} per sq ft of wall or ceiling painted (labor only).",
      "La pintura cuesta {price} por pie cuadrado de pared o techo pintado (solo mano de obra).",
      "A pintura custa {price} por pé quadrado de parede ou teto pintado (só mão de obra).",
    ],
    "chat.item.demolition": [
      "Demolition is {price} per sq ft of bathroom floor (labor only).",
      "La demolición cuesta {price} por pie cuadrado de piso del baño (solo mano de obra).",
      "A demolição custa {price} por pé quadrado de piso do banheiro (só mão de obra).",
    ],
    "chat.item.flooring": [
      "Bathroom flooring is {price} per sq ft of bathroom floor (labor only; tile floors are priced as tile).",
      "El piso del baño cuesta {price} por pie cuadrado de piso (solo mano de obra; los pisos de azulejo se cobran como azulejo).",
      "O piso do banheiro custa {price} por pé quadrado (só mão de obra; piso cerâmico é cobrado como revestimento cerâmico).",
    ],
    "chat.item.cabinet": [
      "Bathroom cabinet installation is {price} per cabinet (labor only).",
      "La instalación de un gabinete de baño cuesta {price} por gabinete (solo mano de obra).",
      "A instalação de armário de banheiro custa {price} por armário (só mão de obra).",
    ],
    "chat.item.vanity": [
      "Vanity installation is {price} per vanity (labor only).",
      "La instalación de un mueble de lavabo cuesta {price} por mueble (solo mano de obra).",
      "A instalação de gabinete de pia custa {price} por gabinete (só mão de obra).",
    ],
    "chat.item.mirror": [
      "Mirror installation is {price} per standard mirror, or {huge} for a huge/oversized one (labor only).",
      "La instalación de un espejo cuesta {price} por espejo estándar, o {huge} si es extragrande (solo mano de obra).",
      "A instalação de espelho custa {price} por espelho padrão, ou {huge} se for extragrande (só mão de obra).",
    ],
    "chat.item.toilet": [
      "Toilet installation is {price} per toilet (labor only).",
      "La instalación de un inodoro cuesta {price} por inodoro (solo mano de obra).",
      "A instalação de vaso sanitário custa {price} por vaso (só mão de obra).",
    ],
    "chat.item.sink": [
      "Sink installation is {price} per sink (labor only).",
      "La instalación de un lavabo cuesta {price} por lavabo (solo mano de obra).",
      "A instalação de pia custa {price} por pia (só mão de obra).",
    ],
    "chat.item.bathtub": [
      "Bathtub installation is {price} per bathtub (labor only).",
      "La instalación de una bañera cuesta {price} por bañera (solo mano de obra).",
      "A instalação de banheira custa {price} por banheira (só mão de obra).",
    ],
    "chat.item.shower": [
      "Shower installation is {price} per shower (labor only).",
      "La instalación de una ducha cuesta {price} por ducha (solo mano de obra).",
      "A instalação de chuveiro custa {price} por chuveiro (só mão de obra).",
    ],
    "chat.item.door": [
      "Installing the bathroom's entry door is {price} per door (labor only).",
      "Instalar la puerta de entrada del baño cuesta {price} por puerta (solo mano de obra).",
      "Instalar a porta de entrada do banheiro custa {price} por porta (só mão de obra).",
    ],
    "chat.trade": [
      "Our online prices and estimates don't include plumbing or electrical work, and toilets, sinks, showers, and bathtubs also need plumbing work, so expect it to add to the cost. We do not currently hold a contractor licence. Tell us about your project on the Contact page and we'll tell you who will do that work and how it will be priced before any work is agreed.",
      "Nuestros precios y estimaciones en línea no incluyen trabajo de plomería ni electricidad, y los inodoros, lavabos, duchas y bañeras también requieren plomería, así que cuente con que aumentará el costo. Por ahora no tenemos licencia de contratista. Cuéntenos su proyecto en la página de Contacto y le diremos quién hará ese trabajo y cómo se cobrará antes de acordar cualquier trabajo.",
      "Nossos preços e estimativas on-line não incluem serviço de encanamento nem de elétrica, e vasos, pias, chuveiros e banheiras também precisam de encanamento, então conte com um custo maior. No momento não temos licença de empreiteiro. Conte sobre o seu projeto na página de Contato e diremos quem fará esse serviço e como será cobrado antes de combinar qualquer serviço.",
    ],
    "chat.services": [
      "We do bathroom restorations: demolition, installing fixtures (toilets, sinks, showers, bathtubs, vanities, mirrors, doors and cabinets), tile, flooring, and painting walls and ceilings. We don't take on kitchens, exteriors, roofing, or damage restoration. Plumbing and electrical work isn't included in our online estimates and adds to the cost.",
      "Hacemos remodelaciones de baños: demolición, instalación de piezas (inodoros, lavabos, duchas, bañeras, muebles de lavabo, espejos, puertas y gabinetes), azulejo, pisos y pintura de paredes y techos. No hacemos cocinas, exteriores, techos de la casa ni restauración de daños. La plomería y la electricidad no están incluidas en nuestras estimaciones en línea y aumentan el costo.",
      "Fazemos reformas de banheiros: demolição, instalação de peças (vasos, pias, chuveiros, banheiras, gabinetes, espelhos, portas e armários), revestimento cerâmico, pisos e pintura de paredes e tetos. Não fazemos cozinhas, áreas externas, telhados nem restauração de danos. Encanamento e elétrica não estão incluídos nas nossas estimativas on-line e aumentam o custo.",
    ],
    "chat.licence": [
      "We do not currently hold a contractor licence. Before any work is agreed, we'll tell you who will do any plumbing and electrical work, how it will be priced, and whether your job needs any permits. Ask us anything else about this when you get in touch: {phone}.",
      "Por ahora no tenemos licencia de contratista. Antes de acordar cualquier trabajo, le diremos quién hará la plomería y la electricidad que haga falta, cómo se cobrará y si su trabajo necesita algún permiso. Pregúntenos lo que quiera sobre esto cuando nos contacte: {phone}.",
      "No momento não temos licença de empreiteiro. Antes de combinar qualquer serviço, diremos quem fará o encanamento e a elétrica necessários, como serão cobrados e se o seu serviço precisa de algum alvará. Pergunte o que quiser sobre isso quando entrar em contato: {phone}.",
    ],
    "chat.warranty": [
      "We don't advertise a standard warranty on this website. If you'd like one, ask us before you agree to the work, and make sure any warranty terms are given to you in writing.",
      "No anunciamos una garantía estándar en este sitio web. Si quiere una, pídanosla antes de acordar el trabajo y asegúrese de recibir por escrito los términos de cualquier garantía.",
      "Não anunciamos uma garantia padrão neste site. Se quiser uma, peça antes de combinar o serviço e confira se os termos de qualquer garantia são entregues a você por escrito.",
    ],
    "chat.timeline": [
      "It depends on the size of the bathroom and the work involved. We'll give you an expected timeline once we've seen the job — call {phone} or use the Contact page.",
      "Depende del tamaño del baño y del trabajo que se necesite. Le daremos un plazo estimado cuando hayamos visto el trabajo: llame al {phone} o use la página de Contacto.",
      "Depende do tamanho do banheiro e do serviço necessário. Daremos um prazo estimado depois de ver o serviço: ligue para {phone} ou use a página de Contato.",
    ],
    "chat.privacy": [
      "Our Privacy Notice (linked at the bottom of every page) explains what we collect and how to ask us to access or delete your information.",
      "Nuestro Aviso de privacidad (enlazado al final de cada página) explica qué datos recopilamos y cómo pedirnos ver o borrar su información.",
      "Nosso Aviso de Privacidade (com link no fim de cada página) explica quais dados coletamos e como pedir para acessar ou excluir suas informações.",
    ],
    "chat.contact": [
      "You can reach us at {phone} or {email}, or use the form on our Contact page to send us your request.",
      "Puede comunicarse con nosotros al {phone} o en {email}, o usar el formulario de nuestra página de Contacto para enviarnos su solicitud.",
      "Você pode falar conosco pelo {phone} ou por {email}, ou usar o formulário da nossa página de Contato para enviar o seu pedido.",
    ],
    "chat.hours": [
      "Reach out through the Contact page or give us a call at {phone}, and we'll get back to you as soon as we can.",
      "Escríbanos desde la página de Contacto o llámenos al {phone} y le responderemos lo antes posible.",
      "Escreva pela página de Contato ou ligue para {phone} e responderemos o quanto antes.",
    ],
    "chat.area": [
      "Call {phone} or use the Contact page with your address and we'll tell you whether we can take on your job.",
      "Llame al {phone} o use la página de Contacto con su dirección y le diremos si podemos hacer su trabajo.",
      "Ligue para {phone} ou use a página de Contato com o seu endereço e diremos se podemos fazer o seu serviço.",
    ],
    "chat.photos": [
      "We don't have photos of our own completed projects online yet — we'd rather show nothing than someone else's work. Ask us about past jobs when you get in touch.",
      "Todavía no tenemos en línea fotos de nuestros proyectos terminados: preferimos no mostrar nada antes que el trabajo de otra persona. Pregúntenos por trabajos anteriores cuando nos contacte.",
      "Ainda não temos on-line fotos dos nossos projetos concluídos: preferimos não mostrar nada a mostrar o trabalho de outra pessoa. Pergunte sobre trabalhos anteriores quando entrar em contato.",
    ],
    "chat.greeting": [
      "Hello! Ask me about our bathroom work or prices, or get a rough estimate of your bathroom job.",
      "¡Hola! Pregúnteme por nuestros trabajos de baño o nuestros precios, o pida una estimación aproximada de su baño.",
      "Olá! Pergunte sobre nossos serviços de banheiro ou nossos preços, ou peça uma estimativa aproximada do seu banheiro.",
    ],
    "chat.thanks": [
      "You're welcome! If you'd like to talk to a person, call {phone}.",
      "¡De nada! Si quiere hablar con una persona, llame al {phone}.",
      "De nada! Se quiser falar com uma pessoa, ligue para {phone}.",
    ],
    "chat.fallback": [
      "Sorry, I didn't understand that. I can answer questions about our bathroom work and prices, or give you a rough estimate. To talk to a person, call {phone} or use the Contact page.",
      "Lo siento, no entendí. Puedo responder preguntas sobre nuestros trabajos de baño y nuestros precios, o darle una estimación aproximada. Para hablar con una persona, llame al {phone} o use la página de Contacto.",
      "Desculpe, não entendi. Posso responder perguntas sobre nossos serviços de banheiro e nossos preços, ou dar uma estimativa aproximada. Para falar com uma pessoa, ligue para {phone} ou use a página de Contato.",
    ],
    "chat.fallbackNoEstimate": [
      "Sorry, I didn't understand that. I can answer questions about our bathroom work. To talk to a person, call {phone} or use the Contact page.",
      "Lo siento, no entendí. Puedo responder preguntas sobre nuestros trabajos de baño. Para hablar con una persona, llame al {phone} o use la página de Contacto.",
      "Desculpe, não entendi. Posso responder perguntas sobre nossos serviços de banheiro. Para falar com uma pessoa, ligue para {phone} ou use a página de Contato.",
    ],

    // ---------- chat window and estimate flow (js/script.js) ----------
    "chat.you": ["YOU", "TÚ", "VOCÊ"],
    "chat.typing": ["Assistant is typing", "El asistente está escribiendo", "O assistente está digitando"],
    "chat.estimateButton": [
      "Get a bathroom price estimate →",
      "Obtener una estimación del precio del baño →",
      "Fazer uma estimativa de preço do banheiro →",
    ],
    "chat.estimateRequest": [
      "I'd like a bathroom price estimate",
      "Quisiera una estimación del precio de mi baño",
      "Quero uma estimativa de preço do meu banheiro",
    ],
    "progress.complete": ["{pct}% complete", "{pct}% completado", "{pct}% concluído"],
    "flow.scopeIntro": [
      "Sure! Let's get you a rough, non-binding bathroom labor estimate. Nothing you enter here is sent to us. First, which work does the job need? Only what you choose is priced.",
      "¡Claro! Vamos a preparar una estimación aproximada y no vinculante de la mano de obra de su baño. Nada de lo que escriba aquí se nos envía. Primero, ¿qué trabajo necesita? Solo se cotiza lo que usted elija.",
      "Claro! Vamos fazer uma estimativa aproximada e sem compromisso da mão de obra do seu banheiro. Nada do que você informar aqui é enviado para nós. Primeiro, qual serviço você precisa? Só entra no cálculo o que você escolher.",
    ],
    "flow.dimensionsIntro": [
      "Now the room's floor size, in feet.",
      "Ahora el tamaño del piso del baño, en pies.",
      "Agora o tamanho do piso do banheiro, em pés.",
    ],
    "flow.dimensionsIntroHeight": [
      "Now the room's size, in feet. The wall work you chose needs the ceiling height too.",
      "Ahora el tamaño del baño, en pies. Para el trabajo de paredes que eligió también necesitamos la altura del techo.",
      "Agora o tamanho do banheiro, em pés. Para o serviço de paredes que você escolheu também precisamos da altura do teto.",
    ],
    "flow.dimensionLabel": ["{label} (ft)", "{label} (pies)", "{label} (pés)"],
    "flow.fixturesIntro": [
      "How many of each should we install? Leave blank or enter 0 for any that don't apply.",
      "¿Cuántas de cada una debemos instalar? Deje en blanco o escriba 0 en las que no correspondan.",
      "Quantas de cada uma devemos instalar? Deixe em branco ou digite 0 nas que não se aplicam.",
    ],
    "flow.cancelled": [
      "No problem, I've stopped the estimate. Ask me anything else, or say “bathroom quote” to start over.",
      "No hay problema, detuve la estimación. Pregúnteme lo que quiera o escriba “cotización del baño” para empezar de nuevo.",
      "Sem problemas, parei a estimativa. Pergunte o que quiser ou escreva “orçamento do banheiro” para começar de novo.",
    ],
    "flow.cancel": ["Cancel", "Cancelar", "Cancelar"],
    "flow.continue": ["Continue →", "Continuar →", "Continuar →"],
    "flow.skip": ["Skip", "Omitir", "Pular"],
    "flow.getEstimate": ["Get My Estimate →", "Ver mi estimación →", "Ver minha estimativa →"],
    "flow.seeEstimate": ["See My Estimate →", "Ver mi estimación →", "Ver minha estimativa →"],
    "flow.doesNotFit": [
      "Not enough room for all of these — reduce the count, make the room bigger, or check what else needs to be picked first (e.g. a vanity or sink for a mirror to mount above).",
      "No hay espacio para todas: reduzca la cantidad, agrande el baño o revise qué más hay que elegir primero (por ejemplo, un mueble de lavabo o un lavabo para colgar un espejo encima).",
      "Não há espaço para todas: diminua a quantidade, aumente o banheiro ou veja o que precisa ser escolhido antes (por exemplo, um gabinete ou uma pia para instalar um espelho em cima).",
    ],
    "flow.fixHighlighted": [
      "Please fix the highlighted answers above.",
      "Corrija las respuestas marcadas arriba.",
      "Corrija as respostas destacadas acima.",
    ],
    "walls.intro": [
      "Which wall(s) carry the plumbing stack? Click them directly in the 3D preview — pick as many as apply. The toilet, sink, tub, and shower will only be placed on the wall(s) you choose.",
      "¿Qué pared o paredes tienen la bajante de plomería? Haga clic en ellas directamente en la vista 3D; elija todas las que correspondan. El inodoro, el lavabo, la bañera y la ducha solo se colocarán en las paredes que elija.",
      "Qual parede ou quais paredes têm a prumada hidráulica? Clique nelas direto na visualização 3D; escolha todas as que se aplicam. O vaso, a pia, a banheira e o chuveiro só serão colocados nas paredes que você escolher.",
    ],
    "walls.none": ["No walls selected yet.", "Todavía no hay paredes elegidas.", "Nenhuma parede escolhida ainda."],
    "walls.one": ["1 wall selected.", "1 pared elegida.", "1 parede escolhida."],
    "walls.many": ["{n} walls selected.", "{n} paredes elegidas.", "{n} paredes escolhidas."],
    "entry.howMany": [
      "How many entry points (doors or openings) does this bathroom have?",
      "¿Cuántas entradas (puertas o aberturas) tiene este baño?",
      "Quantas entradas (portas ou vãos) este banheiro tem?",
    ],
    "entry.clickWall": [
      "click its wall in the 3D preview.",
      "Haga clic en su pared en la vista 3D.",
      "Clique na parede dela na visualização 3D.",
    ],
    "entry.clickWallOf": [
      "Entry point {i} of {n}: click its wall in the 3D preview.",
      "Entrada {i} de {n}: haga clic en su pared en la vista 3D.",
      "Entrada {i} de {n}: clique na parede dela na visualização 3D.",
    ],
    "entry.noWall": ["No wall selected yet.", "Todavía no hay una pared elegida.", "Nenhuma parede escolhida ainda."],
    "entry.left": ["← Move left", "← Mover a la izquierda", "← Mover para a esquerda"],
    "entry.right": ["Move right →", "Mover a la derecha →", "Mover para a direita →"],
    "entry.hasDoor": ["Does this entry point have a door?", "¿Esta entrada tiene puerta?", "Esta entrada tem porta?"],
    "entry.archway": ["No — open archway", "No, es un arco abierto", "Não, é um vão aberto"],
    "entry.confirm": ["Confirm entry point", "Confirmar entrada", "Confirmar entrada"],
    "entry.confirmNext": ["Confirm & next →", "Confirmar y seguir →", "Confirmar e seguir →"],
    "entry.doesNotFit": [
      "That spot doesn't fit — try a different wall, or nudge it clear of what's already there.",
      "No cabe en ese lugar: pruebe otra pared o muévala para que no choque con lo que ya está.",
      "Não cabe nesse lugar: tente outra parede ou mova para longe do que já está lá.",
    ],
    "entry.wallSelected": [
      "Wall selected — nudge it into place and confirm below.",
      "Pared elegida: ajuste la posición y confirme abajo.",
      "Parede escolhida: ajuste a posição e confirme abaixo.",
    ],

    // ---------- estimate card ----------
    "card.eyebrow": ["Your Estimate", "Su estimación", "Sua estimativa"],
    "card.title": ["Bathroom Restoration", "Remodelación de baño", "Reforma de banheiro"],
    "card.lede": [
      "Rough, non-binding labor estimate — details below.",
      "Estimación aproximada y no vinculante de la mano de obra. Detalles abajo.",
      "Estimativa aproximada e sem compromisso da mão de obra. Detalhes abaixo.",
    ],
    "card.ledeMaterials": [
      "Rough, non-binding estimate — labor plus real current prices for the exact products you picked.",
      "Estimación aproximada y no vinculante: mano de obra más los precios reales actuales de los productos exactos que eligió.",
      "Estimativa aproximada e sem compromisso: mão de obra mais os preços reais atuais dos produtos exatos que você escolheu.",
    ],
    "card.noWork": [
      "No priced work selected",
      "No eligió ningún trabajo con precio",
      "Nenhum serviço com preço escolhido",
    ],
    "card.laborSubtotal": ["Labor Subtotal", "Subtotal de mano de obra", "Subtotal de mão de obra"],
    "card.materialsSubtotal": ["Materials Subtotal", "Subtotal de materiales", "Subtotal de materiais"],
    "card.total": ["Estimated Labor Total", "Total estimado de mano de obra", "Total estimado de mão de obra"],
    "card.totalBeforePlumbing": [
      "Estimated Labor Total, before plumbing",
      "Total estimado de mano de obra, sin la plomería",
      "Total estimado de mão de obra, sem o encanamento",
    ],
    "card.totalMaterials": [
      "Estimated Total (Labor + Materials)",
      "Total estimado (mano de obra + materiales)",
      "Total estimado (mão de obra + materiais)",
    ],
    "card.totalMaterialsBeforePlumbing": [
      "Estimated Total (Labor + Materials), before plumbing",
      "Total estimado (mano de obra + materiales), sin la plomería",
      "Total estimado (mão de obra + materiais), sem o encanamento",
    ],
    "card.plumbingTotalNote": [
      "This is not the full cost of your job: plumbing work for the {n} toilet/sink/shower/bathtub item(s) you listed will be added on top of this total.",
      "Este no es el costo total de su trabajo: la plomería de las {n} pieza(s) que indicó (inodoro, lavabo, ducha o bañera) se sumará a este total.",
      "Este não é o custo total do seu serviço: o encanamento das {n} peça(s) que você informou (vaso, pia, chuveiro ou banheira) será somado a este total.",
    ],
    "card.excluded.listedPlumbing": [
      "Plumbing for the {n} toilet/sink/shower/bathtub item(s) you listed",
      "Plomería de las {n} pieza(s) indicadas (inodoro, lavabo, ducha o bañera)",
      "Encanamento das {n} peça(s) informadas (vaso, pia, chuveiro ou banheira)",
    ],
    "card.excluded.trades": [
      "Plumbing & electrical work",
      "Trabajo de plomería y electricidad",
      "Serviço de encanamento e elétrica",
    ],
    "card.excluded.otherTrades": [
      "Any other plumbing & electrical work",
      "Cualquier otro trabajo de plomería y electricidad",
      "Qualquer outro serviço de encanamento e elétrica",
    ],
    "card.excluded.permits": [
      "Permits & any applicable taxes",
      "Permisos e impuestos aplicables",
      "Alvarás e impostos aplicáveis",
    ],
    "card.excluded.materialsPermits": [
      "Materials, permits & any applicable taxes",
      "Materiales, permisos e impuestos aplicables",
      "Materiais, alvarás e impostos aplicáveis",
    ],
    "card.excluded.extra": ["Extra — not included", "Aparte, no incluido", "À parte, não incluído"],
    "card.excluded.notIncluded": ["Not included", "No incluido", "Não incluído"],
    "card.plumbingNote": [
      "Plumbing and electrical work is not included. Toilets, sinks, showers, and bathtubs also need plumbing work, so if you listed any, or your job needs other plumbing or electrical work, expect it to add to the cost. We'll tell you how it will be handled and priced before any work is agreed.",
      "No incluye trabajo de plomería ni electricidad. Los inodoros, lavabos, duchas y bañeras también requieren plomería, así que si indicó alguno, o su trabajo necesita otra plomería o electricidad, cuente con que aumentará el costo. Le diremos cómo se hará y cómo se cobrará antes de acordar cualquier trabajo.",
      "Não inclui serviço de encanamento nem de elétrica. Vasos, pias, chuveiros e banheiras também precisam de encanamento, então se você informou algum, ou se o seu serviço precisa de outro encanamento ou elétrica, conte com um custo maior. Diremos como será feito e cobrado antes de combinar qualquer serviço.",
    ],
    "card.materialsNote": [
      "Materials shown are priced at current Home Depot rates as of when they were last refreshed — confirm before buying. Also not included: permits and any applicable taxes.",
      "Los materiales tienen los precios de Home Depot de la última actualización: confírmelos antes de comprar. Tampoco incluye permisos ni impuestos aplicables.",
      "Os materiais estão com os preços da Home Depot da última atualização: confirme antes de comprar. Também não inclui alvarás nem impostos aplicáveis.",
    ],
    "card.alsoNotIncluded": [
      "Also not included: materials, permits, and any applicable taxes.",
      "Tampoco incluye materiales, permisos ni impuestos aplicables.",
      "Também não inclui materiais, alvarás nem impostos aplicáveis.",
    ],
    "card.disclaimer": [
      "This is an automated, non-binding estimate of labor only, based only on the measurements, counts, and choices you entered and the assumptions listed with it. It is not a quote, offer, or contract. It excludes plumbing and electrical work (including the plumbing any toilets, sinks, showers, or bathtubs need), materials, permits, and any applicable taxes, which will add to the cost where your job needs them. Prices are current as of the date generated and may change. Your actual price is set only in a written agreement after we review your project in person.",
      "Esta es una estimación automática y no vinculante solo de la mano de obra, basada únicamente en las medidas, cantidades y opciones que usted indicó y en los supuestos que la acompañan. No es una cotización, oferta ni contrato. No incluye trabajo de plomería ni electricidad (incluida la plomería que necesiten inodoros, lavabos, duchas o bañeras), materiales, permisos ni impuestos aplicables, que aumentarán el costo si su trabajo los necesita. Los precios son los vigentes en la fecha en que se generó y pueden cambiar. Su precio real se fija solo en un acuerdo por escrito, después de revisar su proyecto en persona.",
      "Esta é uma estimativa automática e sem compromisso somente da mão de obra, baseada apenas nas medidas, quantidades e escolhas que você informou e nas premissas que a acompanham. Não é um orçamento, oferta nem contrato. Não inclui serviço de encanamento nem de elétrica (incluindo o encanamento de vasos, pias, chuveiros ou banheiras), materiais, alvarás nem impostos aplicáveis, que aumentarão o custo se o seu serviço precisar deles. Os preços são os vigentes na data em que foi gerada e podem mudar. Seu preço real só é definido em um acordo por escrito, depois que avaliarmos o seu projeto pessoalmente.",
    ],
    "card.disclaimerMaterials": [
      "This is an automated, non-binding estimate combining labor at our current rates with current Home Depot prices for the exact products you picked, based only on what you entered and the assumptions listed with it. It is not a quote, offer, or contract. It excludes plumbing and electrical installation work (the labor to hook up any toilets, sinks, showers, or bathtubs listed), permits, and any applicable taxes, which will add to the cost where your job needs them. Product prices were current as of when they were last refreshed and may have changed since — confirm before buying. Your actual price is set only in a written agreement after we review your project in person.",
      "Esta es una estimación automática y no vinculante que combina la mano de obra según nuestras tarifas actuales con los precios actuales de Home Depot de los productos exactos que eligió, basada únicamente en lo que usted indicó y en los supuestos que la acompañan. No es una cotización, oferta ni contrato. No incluye trabajo de instalación de plomería ni electricidad (la mano de obra para conectar los inodoros, lavabos, duchas o bañeras indicados), permisos ni impuestos aplicables, que aumentarán el costo si su trabajo los necesita. Los precios de los productos eran los vigentes en su última actualización y pueden haber cambiado: confírmelos antes de comprar. Su precio real se fija solo en un acuerdo por escrito, después de revisar su proyecto en persona.",
      "Esta é uma estimativa automática e sem compromisso que combina a mão de obra pelos nossos valores atuais com os preços atuais da Home Depot dos produtos exatos que você escolheu, baseada apenas no que você informou e nas premissas que a acompanham. Não é um orçamento, oferta nem contrato. Não inclui serviço de instalação de encanamento nem de elétrica (a mão de obra para ligar os vasos, pias, chuveiros ou banheiras informados), alvarás nem impostos aplicáveis, que aumentarão o custo se o seu serviço precisar deles. Os preços dos produtos eram os vigentes na última atualização e podem ter mudado: confirme antes de comprar. Seu preço real só é definido em um acordo por escrito, depois que avaliarmos o seu projeto pessoalmente.",
    ],
    "card.assumptions": ["What this estimate assumes", "Qué supone esta estimación", "O que esta estimativa considera"],
    "card.whereToBuy": ["Where to buy the materials", "Dónde comprar los materiales", "Onde comprar os materiais"],
    "card.exportPdf": ["Export as PDF", "Descargar en PDF", "Baixar em PDF"],
    "card.contactCta": ["Contact Us About This →", "Contáctenos sobre esto →", "Fale conosco sobre isto →"],
    "card.business": [
      "Premium Restoration, operated by an individual (not a registered company)",
      "Premium Restoration, operado por una persona física (no una empresa registrada)",
      "Premium Restoration, operado por uma pessoa física (não é uma empresa registrada)",
    ],
    "card.businessNamed": [
      "Premium Restoration, operated by {name}, an individual (not a registered company)",
      "Premium Restoration, operado por {name}, una persona física (no una empresa registrada)",
      "Premium Restoration, operado por {name}, uma pessoa física (não é uma empresa registrada)",
    ],
    "summary.materials": [
      "Materials picked (real current Home Depot prices):",
      "Materiales elegidos (precios reales actuales de Home Depot):",
      "Materiais escolhidos (preços reais atuais da Home Depot):",
    ],
    "summary.materialsSubtotal": [
      "- Materials subtotal: {total}",
      "- Subtotal de materiales: {total}",
      "- Subtotal de materiais: {total}",
    ],
    "summary.grandTotal": [
      "- Labor + materials total: {total}",
      "- Total de mano de obra + materiales: {total}",
      "- Total de mão de obra + materiais: {total}",
    ],
    "pdf.preparing": ["Preparing PDF…", "Preparando el PDF…", "Preparando o PDF…"],
    "pdf.retry": ["Retry PDF", "Reintentar PDF", "Tentar PDF de novo"],
    "pdf.failed": [
      "Sorry, the PDF couldn't be prepared. Check your connection and press Retry PDF.",
      "Lo sentimos, no se pudo preparar el PDF. Revise su conexión y presione Reintentar PDF.",
      "Desculpe, não foi possível preparar o PDF. Verifique sua conexão e toque em Tentar PDF de novo.",
    ],
    "pdf.title": [
      "Bathroom Restoration — Labor Estimate",
      "Remodelación de baño: estimación de mano de obra",
      "Reforma de banheiro: estimativa de mão de obra",
    ],
    "pdf.titleMaterials": [
      "Bathroom Restoration — Estimate (Labor + Materials)",
      "Remodelación de baño: estimación (mano de obra + materiales)",
      "Reforma de banheiro: estimativa (mão de obra + materiais)",
    ],

    // ---------- materials picks ----------
    "materials.zipIntro": [
      "Now let's pick the exact product for each item, at real current prices — starting with your ZIP code. (Prices can vary a little by area.)",
      "Ahora elijamos el producto exacto para cada cosa, con precios reales actuales, empezando por su código postal (ZIP). (Los precios pueden variar un poco según la zona.)",
      "Agora vamos escolher o produto exato de cada item, com preços reais atuais, começando pelo seu CEP americano (ZIP code). (Os preços podem variar um pouco conforme a região.)",
    ],
    "materials.zipLabel": ["ZIP code", "Código postal (ZIP)", "CEP (ZIP code)"],
    "materials.zipError": [
      "Enter a 5-digit ZIP code.",
      "Escriba un código postal de 5 dígitos.",
      "Informe um ZIP code de 5 dígitos.",
    ],
    "materials.which": [
      "Which {label} would you like? ({qty} {unit})",
      "Elija el producto para: {label} ({qty} {unit})",
      "Escolha o produto para: {label} ({qty} {unit})",
    ],
    "materials.priceAt": ["{price} at {store}", "{price} en {store}", "{price} na {store}"],
    "materials.pickOne": [
      "Pick one option to continue.",
      "Elija una opción para continuar.",
      "Escolha uma opção para continuar.",
    ],
    "materials.cheaperThan": [
      "Cheaper than {others} for the same product.",
      "Más barato que {others} por el mismo producto.",
      "Mais barato que {others} pelo mesmo produto.",
    ],

    // ---------- Get a Quote form ----------
    "form.error.name": ["Enter your name.", "Escriba su nombre.", "Informe seu nome."],
    "form.error.phone": [
      "Enter a phone number we can call you on.",
      "Escriba un número de teléfono al que podamos llamarle.",
      "Informe um telefone para podermos ligar para você.",
    ],
    "form.error.phoneInvalid": [
      "Enter a valid phone number, e.g. (385) 356-8733.",
      "Escriba un número de teléfono válido, por ejemplo (385) 356-8733.",
      "Informe um telefone válido, por exemplo (385) 356-8733.",
    ],
    "form.error.email": ["Enter your email address.", "Escriba su correo electrónico.", "Informe seu e-mail."],
    "form.error.emailInvalid": [
      "Enter a valid email address, e.g. name@example.com.",
      "Escriba un correo electrónico válido, por ejemplo nombre@ejemplo.com.",
      "Informe um e-mail válido, por exemplo nome@exemplo.com.",
    ],
    "form.subject": [
      "Bathroom quote request from {name}",
      "Solicitud de cotización de baño de {name}",
      "Pedido de orçamento de banheiro de {name}",
    ],
    "form.body.name": ["Name", "Nombre", "Nome"],
    "form.body.phone": ["Phone", "Teléfono", "Telefone"],
    "form.body.email": ["Email", "Correo electrónico", "E-mail"],
    "form.body.service": ["Service", "Servicio", "Serviço"],
    "form.body.details": ["Project details", "Detalles del proyecto", "Detalhes do projeto"],
    "form.sending": ["Sending…", "Enviando…", "Enviando…"],
    "form.status.sending": ["Sending your request…", "Enviando su solicitud…", "Enviando o seu pedido…"],
    "form.status.mailto": [
      "Your email app should now open with your request filled in. [b:Please press Send in your email app] — we don't receive anything until you do. If nothing opened, [again:open it again], email us at [email] or call [phone].",
      "Ahora debería abrirse su aplicación de correo con su solicitud ya escrita. [b:Presione Enviar en su aplicación de correo]: no recibimos nada hasta que lo haga. Si no se abrió nada, [again:vuelva a abrirla], escríbanos a [email] o llame al [phone].",
      "Agora o seu aplicativo de e-mail deve abrir com o pedido já preenchido. [b:Toque em Enviar no seu aplicativo de e-mail]: não recebemos nada até você fazer isso. Se nada abriu, [again:abra de novo], escreva para [email] ou ligue para [phone].",
    ],
    "form.status.sent": [
      "[b:Request sent.] Thank you — we've received your request and will get back to you as soon as we can. If it's urgent, call [phone].",
      "[b:Solicitud enviada.] Gracias: recibimos su solicitud y le responderemos lo antes posible. Si es urgente, llame al [phone].",
      "[b:Pedido enviado.] Obrigado! Recebemos o seu pedido e responderemos o quanto antes. Se for urgente, ligue para [phone].",
    ],
    "form.status.failed": [
      "[b:Sorry, your request wasn't sent.] Nothing you entered has been lost — please try again, or call us at [phone] or email [email].",
      "[b:Lo sentimos, su solicitud no se envió.] No se perdió nada de lo que escribió: inténtelo de nuevo, o llámenos al [phone] o escriba a [email].",
      "[b:Desculpe, o seu pedido não foi enviado.] Nada do que você digitou foi perdido: tente de novo, ou ligue para [phone] ou escreva para [email].",
    ],

    // ---------- 3D room (js/bathroom-room-3d.js) ----------
    "room3d.walkIn": ["Walk in", "Entrar", "Entrar"],
    "room3d.overview": ["Overview", "Vista general", "Visão geral"],
    "room3d.entry": ["Entry {n}", "Entrada {n}", "Entrada {n}"],
    "room3d.tooBig": ["Too big for this room", "Demasiado grande para este baño", "Grande demais para este banheiro"],
    "room3d.toilet.A": ["Skirted two-piece", "Dos piezas con faldón", "Duas peças com saia"],
    "room3d.toilet.B": ["One-piece seamless", "Una pieza, sin uniones", "Peça única, sem emendas"],
    "room3d.slot.tub": ["Tub", "Bañera", "Banheira"],
    "room3d.slot.tubFaucet": ["Tub faucet", "Llave de la bañera", "Torneira da banheira"],
    "room3d.slot.vanitySink": ["Vanity sink", "Lavabo del mueble", "Cuba do gabinete"],
    "room3d.slot.vanityFaucet": ["Sink faucet", "Llave del lavabo", "Torneira da pia"],
    "room3d.slot.showerValve": ["Shower valve", "Válvula de la ducha", "Registro do chuveiro"],
    "room3d.option.freestanding": ["Freestanding 60 in.", "Independiente 60 pulg.", "Independente 60 pol."],
    "room3d.option.K-1184-0": [
      "Devonshire 60 in. alcove",
      "Devonshire 60 pulg. empotrada",
      "Devonshire 60 pol. embutida",
    ],
    "room3d.option.K-1163-0": ["Sunward 60 in. oval", "Sunward 60 pulg. ovalada", "Sunward 60 pol. oval"],
    "room3d.option.K-1165-0": ["Sunward 72 in. oval", "Sunward 72 pulg. ovalada", "Sunward 72 pol. oval"],
    "room3d.option.K-14426-CP": ["Purist wall spout", "Purist, caño de pared", "Purist, bica de parede"],
    "room3d.option.K-73081-4-CP": [
      "Composed deck-mount filler",
      "Composed, llenador sobre cubierta",
      "Composed, misturador de borda",
    ],
    "room3d.option.K-2874-0": ["Canvas white", "Canvas blanco", "Canvas branca"],
    "room3d.option.K-2608-SU-NA": ["Bachata stainless", "Bachata acero inoxidable", "Bachata inox"],
    "room3d.option.K-14410-4-CP": ["Purist widespread", "Purist, de 3 orificios", "Purist, 3 furos"],
    "room3d.option.K-77974-9-CP": ["Components handles only", "Components, solo manijas", "Components, só manoplas"],
    "room3d.option.K-T73117-4-CP": ["Composed", "Composed", "Composed"],
    "room3d.option.K-T78027-9-CP": ["Components thermostatic", "Components termostática", "Components termostático"],
    "room3d.option.K-T72770-4-CP": [
      "Artifacts transfer valve",
      "Artifacts, válvula desviadora",
      "Artifacts, desviador",
    ],

    // ---------- PDF (js/estimate-pdf.js) ----------
    "pdf.preparedFor": ["Prepared for: {name}", "Preparado para: {name}", "Preparado para: {name}"],
    "pdf.generated": ["Generated {date}", "Generado el {date}", "Gerado em {date}"],
    "pdf.page": ["Page {i} of {n}", "Página {i} de {n}", "Página {i} de {n}"],

    // ---------- settings shown on the page (js/site-config.js) ----------
    "config.formService": [
      "our form service provider",
      "nuestro proveedor de servicio de formularios",
      "nosso provedor de serviço de formulários",
    ],
    "config.period.day": ["{n} day", "{n} día", "{n} dia"],
    "config.period.days": ["{n} days", "{n} días", "{n} dias"],
    "config.period.businessDay": ["{n} business day", "{n} día hábil", "{n} dia útil"],
    "config.period.businessDays": ["{n} business days", "{n} días hábiles", "{n} dias úteis"],
    "config.period.week": ["{n} week", "{n} semana", "{n} semana"],
    "config.period.weeks": ["{n} weeks", "{n} semanas", "{n} semanas"],
    "config.period.month": ["{n} month", "{n} mes", "{n} mês"],
    "config.period.months": ["{n} months", "{n} meses", "{n} meses"],
  };

  function detect() {
    var doc = typeof document !== "undefined" ? document : null;
    var lang = doc && doc.documentElement ? String(doc.documentElement.lang || "").toLowerCase() : "";
    if (lang.indexOf("es") === 0) return "es";
    if (lang.indexOf("pt") === 0) return "pt";
    return "en";
  }

  var current = detect();

  function index(lang) {
    var i = LANGS.indexOf(lang || current);
    return i === -1 ? 0 : i;
  }

  // t("key", { name: value }, lang?) — the text in `lang` (default: the
  // page's language), falling back to English.
  function t(key, vars, lang) {
    var entry = S[key];
    if (!entry) throw new Error("I18n: unknown key " + key);
    var text = entry[index(lang)];
    if (text === undefined || text === null) text = entry[0];
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, function (m, name) {
        return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
      });
    }
    return text;
  }

  return {
    LANGS: LANGS,
    LOCALES: LOCALES,
    NAMES: NAMES,
    STRINGS: S,
    t: t,
    lang: function () {
      return current;
    },
    // Tests only: pretend the page is in another language.
    setLang: function (lang) {
      current = LANGS.indexOf(lang) === -1 ? "en" : lang;
    },
    locale: function (lang) {
      return LOCALES[lang || current] || LOCALES.en;
    },
    name: function (lang) {
      return NAMES[lang || current];
    },
  };
});
