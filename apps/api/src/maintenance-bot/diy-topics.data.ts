export interface DiyTopic {
  key: string;
  keywords: string[];
  title: string;
  guidance: string;
}

// Purely educational — how a homeowner can safely handle common, low-risk
// tasks themselves. Deliberately excludes anything touching gas lines, main
// water/sewage lines, electrical panel work, or roofing, matching the same
// handyman-vs-licensed-pro boundary already drawn in SYSTEM_PROMPT.
export const DIY_TOPICS: DiyTopic[] = [
  {
    key: 'clogged_drain',
    keywords: ['clogged drain', 'slow drain', 'drain clog', 'unclog', 'slow to drain', 'sink wont drain', 'sink backed up', 'bathtub drain slow'],
    title: 'Clearing a slow or clogged drain',
    guidance: 'Try a plunger first (cover any overflow opening for a sink). If that fails, remove and clean the drain stopper, then try a zip-it tool or a mixture of baking soda and vinegar followed by hot water. Avoid chemical drain cleaners on older pipes. If the clog persists after these steps, it may be further down the line and worth a professional look.',
  },
  {
    key: 'gfci_breaker',
    keywords: ['gfci', 'tripped outlet', 'tripped breaker', 'outlet not working', 'reset breaker', 'power out in one room', 'breaker keeps tripping', 'outlet has no power'],
    title: 'Resetting a tripped GFCI outlet or breaker',
    guidance: 'For a GFCI outlet, press the "Reset" button firmly (you should hear/feel a click). For a tripped breaker, switch it fully to OFF before switching back to ON. If it trips again immediately, unplug whatever was running on that circuit first — repeated tripping can mean an overloaded circuit or a real fault, which is worth having looked at rather than repeatedly reset.',
  },
  {
    key: 'hvac_filter',
    keywords: ['hvac filter', 'furnace filter', 'air filter', 'ac filter', 'when to change filter', 'furnace maintenance', 'ac maintenance'],
    title: 'Replacing an HVAC/furnace filter',
    guidance: 'Turn off the system, locate the filter slot (usually near the return air duct or inside the air handler), note the size printed on the old filter\'s frame, and slide in the new one with the airflow arrow pointing toward the unit. Most homes should replace this every 1-3 months, more often with pets.',
  },
  {
    key: 'recaulk_tub',
    keywords: ['caulk', 'recaulk', 're-caulk', 'tub caulk', 'shower caulk'],
    title: 'Re-caulking a tub, shower, or sink',
    guidance: 'Score along the old caulk line with a utility knife and peel it out, clean the surface with rubbing alcohol and let it dry fully, then apply a bead of 100% silicone caulk in a smooth, steady motion and tool it with a wet finger or caulk tool before it skins over. Wait the label\'s full cure time before using the tub/shower.',
  },
  {
    key: 'dryer_vent',
    keywords: ['dryer vent', 'lint trap', 'dryer not drying'],
    title: 'Cleaning a dryer vent',
    guidance: 'Unplug the dryer and pull it away from the wall, disconnect the vent hose, and vacuum out lint from both the hose and the wall duct opening (a dryer vent brush kit makes this easier for longer runs). Clean the lint trap after every load. A dryer that suddenly takes much longer to dry clothes is a sign the vent needs this.',
  },
  {
    key: 'thermostat',
    keywords: ['thermostat', 'programmable thermostat', 'smart thermostat setup'],
    title: 'Adjusting or programming a thermostat',
    guidance: 'Most thermostats have a menu/settings button to set schedules, hold temperatures, or switch between heat/cool/auto. Check the battery compartment if the screen is blank. For smart thermostats, the manufacturer\'s app usually walks through setup step by step.',
  },
  {
    key: 'smoke_detector_chirp',
    keywords: ['smoke detector chirping', 'smoke alarm beeping', 'co detector chirp', 'detector low battery'],
    title: 'Silencing a chirping smoke/CO detector',
    guidance: 'A single periodic chirp almost always means a low battery — replace it (or the whole unit if it\'s hardwired with a sealed 10-year battery and past its printed expiration date). After replacing the battery, press and hold the test button for a few seconds to clear the chirp from memory.',
  },
  {
    key: 'water_heater_pilot',
    keywords: ['pilot light', 'water heater pilot', 'relight pilot'],
    title: 'Relighting a gas water heater pilot light',
    guidance: 'Follow the exact steps on the label attached to your water heater — they vary by model. In general: set the gas control knob to "Pilot," hold it down while lighting the pilot with the igniter or a match, keep holding for about a minute until it stays lit, then turn the knob to "On." If you ever smell gas or the pilot won\'t stay lit after a couple of tries, stop and call a licensed professional — this is a case where DIY has a real safety limit.',
  },
  {
    key: 'running_toilet',
    keywords: ['running toilet', 'toilet keeps running', 'toilet flapper', 'toilet fill valve', 'toilet wont stop running', 'toilet running constantly'],
    title: 'Fixing a running toilet',
    guidance: 'Open the tank and check the flapper — if it\'s not sealing, it likely needs replacing (inexpensive, sold at any hardware store, matched to your toilet brand/model). Also check the fill valve\'s water level, which should sit about an inch below the overflow tube; adjust the float if it\'s set too high.',
  },
  {
    key: 'garbage_disposal',
    keywords: ['garbage disposal', 'disposal jammed', 'disposal not working', 'disposal reset'],
    title: 'Clearing or resetting a garbage disposal',
    guidance: 'Turn off power at the switch first. Use the hex-key wrench that came with the unit (or an Allen wrench) in the bottom center hole to manually rotate the blades and free a jam. Press the small red reset button on the underside of the unit. Never put your hand inside the disposal.',
  },
  {
    key: 'fridge_coils',
    keywords: ['fridge coils', 'refrigerator coils', 'condenser coils'],
    title: 'Cleaning refrigerator condenser coils',
    guidance: 'Unplug the fridge, locate the coils (behind a bottom kick-plate or on the back), and vacuum off dust and pet hair with a coil-brush or narrow attachment. Doing this every 6-12 months helps the compressor run more efficiently.',
  },
  {
    key: 'weatherstripping',
    keywords: ['weatherstrip', 'weather stripping', 'drafty door', 'drafty window'],
    title: 'Weatherstripping a drafty door or window',
    guidance: 'Peel off old, cracked weatherstripping and clean the frame surface. Measure and cut new adhesive-backed foam or V-strip weatherstripping to fit, then press it firmly into place along the gap. For door bottoms, a simple draft stopper or new door sweep is an easy add-on.',
  },
  {
    key: 'radiator_bleed',
    keywords: ['bleed radiator', 'radiator not heating', 'baseboard heater air'],
    title: 'Bleeding a radiator or baseboard heater',
    guidance: 'With the heating system on, use a radiator key (or flathead screwdriver on some models) to slowly open the bleed valve until air stops hissing out and water starts to trickle — then close it. Have a small cloth or cup ready to catch drips.',
  },
  {
    key: 'gutter_debris',
    keywords: ['gutter debris', 'clean gutters myself', 'gutter leaves'],
    title: 'Safe gutter-debris removal basics',
    guidance: 'Use a sturdy ladder on level ground with someone spotting you, a small scoop or gloved hand to clear leaves/debris, and flush with a hose afterward to confirm water flows freely to the downspout. Skip this yourself for steep roofs or gutters above a single story — that\'s exactly the kind of job worth booking instead.',
  },
  {
    key: 'drywall_patch',
    keywords: ['drywall hole', 'nail hole', 'patch drywall', 'small hole in wall'],
    title: 'Patching small drywall nail holes',
    guidance: 'For small nail/screw holes, a dab of lightweight spackle applied with a putty knife, smoothed flush, and sanded once dry usually disappears completely with a touch-up coat of matching paint. Larger holes (fist-sized or bigger) need a patch kit or drywall scrap and are a good candidate to book instead.',
  },
  {
    key: 'faucet_washer',
    keywords: ['leaky faucet', 'dripping faucet', 'faucet washer', 'faucet o-ring'],
    title: 'Replacing a leaky faucet washer or O-ring',
    guidance: 'Turn off the water supply valves under the sink first. Depending on the faucet type, you\'ll remove the handle, unscrew the cartridge or stem, and swap the worn rubber washer or O-ring for a matching replacement before reassembling. Bring the old part to the hardware store to match it exactly.',
  },
  {
    key: 'garage_door_sensor',
    keywords: ['garage door sensor', 'garage door opener', 'garage door wont close'],
    title: 'Resetting a garage door opener or realigning safety sensors',
    guidance: 'If the door won\'t close, check the two small sensors near the bottom of the tracks on each side — they need to be aligned and unobstructed (a solid light on both, not blinking). Wipe their lenses clean and gently adjust one until both lights are steady. For opener reprogramming, most models have a "learn" button with steps in the manual.',
  },
  {
    key: 'dehumidifier',
    keywords: ['dehumidifier filter', 'dehumidifier maintenance', 'dehumidifier not collecting water'],
    title: 'Cleaning and maintaining a dehumidifier',
    guidance: 'Empty and rinse the water tank regularly, and remove/rinse the air filter (usually slides out from the front or back) every few weeks — a clogged filter is the most common reason a dehumidifier stops pulling moisture effectively. Let the filter dry fully before reinserting.',
  },
  {
    key: 'dishwasher_not_draining',
    keywords: ['dishwasher not draining', 'dishwasher standing water', 'dishwasher wont drain'],
    title: 'Fixing a dishwasher that won\'t drain',
    guidance: 'Turn off power, remove the bottom rack and filter assembly (usually twists out), and clear out any food debris trapped there. Check the drain hose where it connects to the garbage disposal or air gap for a clog. Run the disposal (if connected) since a clogged disposal is a common hidden cause of dishwasher backup.',
  },
  {
    key: 'washing_machine_not_draining',
    keywords: ['washing machine not draining', 'washer wont drain', 'washer full of water'],
    title: 'Fixing a washing machine that won\'t drain',
    guidance: 'Unplug the machine first. Check the drain hose for kinks and the small coin trap/filter (often behind a small panel on the front-bottom of front-loaders) for lint, coins, or debris clogging it — have a towel ready, some water will spill out. Restart a drain/spin cycle once cleared.',
  },
  {
    key: 'ice_maker_not_working',
    keywords: ['ice maker not working', 'ice maker not making ice', 'fridge not making ice'],
    title: 'Troubleshooting a refrigerator ice maker',
    guidance: 'Confirm the water supply line valve behind/under the fridge is fully open and not kinked. Check that the ice maker\'s own on/off switch or arm hasn\'t been bumped off. If ice is clumping or not forming, a partially clogged water filter is a common cause — try replacing it. Give it 24 hours after any fix before expecting normal ice production again.',
  },
  {
    key: 'squeaky_door_hinge',
    keywords: ['squeaky door', 'squeaky hinge', 'door squeak', 'hinge squeaking'],
    title: 'Fixing a squeaky door hinge',
    guidance: 'Lift the hinge pin partway out with a flathead screwdriver and hammer tap, wipe off old grime, apply a few drops of household oil (or dry PTFE/silicone spray) directly to the pin, then work the door back and forth a few times to spread it before wiping off any excess.',
  },
  {
    key: 'sticking_door',
    keywords: ['door sticking', 'door wont close', 'door rubbing frame', 'door hard to close'],
    title: 'Fixing a door that sticks or rubs the frame',
    guidance: 'Check the hinge screws first — loose screws let the door sag and rub; tighten them, and if a screw hole is stripped, replace it with a longer screw into the frame stud. If hinges are fine, look for a shiny rub mark on the door/frame to find exactly where it\'s catching, then lightly sand or plane that spot.',
  },
  {
    key: 'grout_cleaning',
    keywords: ['dirty grout', 'clean grout', 'grout mold', 'reseal grout'],
    title: 'Cleaning and resealing tile grout',
    guidance: 'Scrub grout lines with a stiff nylon brush and a baking-soda-and-water paste (or a dedicated grout cleaner) for everyday dirt/mold, rinse well, and let dry fully. Once clean and dry, apply a penetrating grout sealer with a small brush or applicator bottle — this makes future cleaning much easier and helps resist mold.',
  },
  {
    key: 'exterior_faucet_winterizing',
    keywords: ['winterize outdoor faucet', 'hose bib freeze', 'outdoor spigot freeze', 'frozen outdoor faucet'],
    title: 'Winterizing an outdoor faucet/hose bib',
    guidance: 'Disconnect and drain any hose. Shut off the interior supply valve for that faucet if one exists, then open the outdoor faucet to drain remaining water and leave it open through winter. If there\'s no interior shutoff, an inexpensive foam faucet cover over the spigot adds meaningful freeze protection.',
  },
  {
    key: 'window_ac_maintenance',
    keywords: ['window ac unit', 'window air conditioner', 'window unit not cooling'],
    title: 'Cleaning/maintaining a window AC unit',
    guidance: 'Unplug the unit, remove and wash the front filter (most just slide out), and vacuum visible dust off the front coils/fins with a soft brush attachment. Confirm the unit is tilted slightly toward the outside (about a quarter-inch) so condensation drains out and not back into the room.',
  },
  {
    key: 'ceiling_fan_wobble',
    keywords: ['ceiling fan wobble', 'ceiling fan shaking', 'ceiling fan noise'],
    title: 'Fixing a wobbling or noisy ceiling fan',
    guidance: 'Turn off power at the switch, then tighten the screws holding each blade to its bracket and the bracket to the motor — loose blade screws are the most common wobble cause. If it\'s still off-balance, a small blade-balancing kit (a few dollars, clip-on weights) fixes most remaining wobble.',
  },
  {
    key: 'ceiling_fan_seasonal_direction',
    keywords: ['ceiling fan direction', 'ceiling fan reverse', 'ceiling fan winter setting'],
    title: 'Setting ceiling fan direction for the season',
    guidance: 'Most fans have a small switch on the motor housing. Counterclockwise (the standard forward setting) pushes air straight down for a cooling breeze in summer; clockwise on low pulls air up and gently redistributes warm air pooled at the ceiling in winter. Switch it with the fan fully stopped.',
  },
  {
    key: 'low_water_pressure',
    keywords: ['low water pressure', 'weak water pressure', 'shower pressure low'],
    title: 'Troubleshooting low water pressure at one fixture',
    guidance: 'If it\'s isolated to one faucet or showerhead, unscrew the aerator or showerhead and clean out mineral/sediment buildup (a vinegar soak works well), which is the most common cause. If every fixture in the house is affected, check that the main shutoff valve is fully open — that\'s a case worth a professional look if the valve is already fully open.',
  },
  {
    key: 'attic_ventilation_check',
    keywords: ['attic ventilation', 'attic too hot', 'attic vents blocked'],
    title: 'Basic attic ventilation checks',
    guidance: 'On a visit to the attic, confirm soffit vents (under the roof eaves) aren\'t blocked by insulation, and that ridge or gable vents aren\'t obstructed by debris or nests. Good airflow here reduces summer heat buildup and winter moisture — visible mold, frost, or consistently very high attic temps are worth a professional inspection.',
  },
  {
    key: 'lawn_mower_maintenance',
    keywords: ['lawn mower wont start', 'lawn mower maintenance', 'mower blade dull'],
    title: 'Basic lawn mower maintenance',
    guidance: 'For a mower that won\'t start: check there\'s fresh gas (old gas from last season is a common culprit), the spark plug wire is connected, and the air filter isn\'t clogged. For cut quality, a dull or unbalanced blade is usually the cause of ragged, torn-looking grass — blades should be sharpened or replaced roughly once a season.',
  },
  {
    key: 'exterior_paint_touchup',
    keywords: ['paint touch up', 'peeling exterior paint', 'small paint chip'],
    title: 'Touching up small areas of peeling exterior paint',
    guidance: 'Scrape away loose/peeling paint down to a firm edge, sand the transition smooth, and spot-prime any bare wood before repainting to match. Small, isolated areas are a reasonable DIY task; widespread peeling or bare wood over a large area is worth a professional assessment, since it can signal a moisture problem underneath.',
  },
  {
    key: 'cabinet_hinge_adjustment',
    keywords: ['cabinet door crooked', 'cabinet hinge adjust', 'cabinet door wont close'],
    title: 'Adjusting a crooked or misaligned cabinet door',
    guidance: 'Most modern cabinet hinges have 2-3 small adjustment screws: one shifts the door left/right, one up/down, and one in/out (toward or away from the frame). Loosen the relevant screw slightly, nudge the door into alignment, and retighten — small adjustments go a long way.',
  },
  {
    key: 'sump_pump_check',
    keywords: ['sump pump test', 'sump pump maintenance', 'sump pump not running'],
    title: 'Testing and maintaining a sump pump',
    guidance: 'Test it by slowly pouring a bucket of water into the pit until the float rises and the pump kicks on and drains it back down. Clean any debris out of the pit and confirm the discharge line outside isn\'t blocked or frozen. A pump that doesn\'t activate on this test, or runs but doesn\'t clear the water, is worth having checked before it\'s actually needed in a storm.',
  },
  {
    key: 'vent_register_cleaning',
    keywords: ['dusty air vents', 'clean air vents', 'vent registers dusty'],
    title: 'Cleaning dusty air vents/registers',
    guidance: 'Remove each register cover (usually a couple of screws or clips) and wash it in warm soapy water, then vacuum inside the duct opening as far as your vacuum hose/attachment reaches. This is separate from a full duct cleaning — persistent heavy dust after doing this across every room can be worth a professional duct inspection.',
  },
  {
    key: 'pest_entry_sealing',
    keywords: ['seal gaps pests', 'bugs getting in', 'mice getting in', 'seal entry points'],
    title: 'Sealing common pest entry points yourself',
    guidance: 'Walk the exterior looking for gaps around pipes, cables, and the foundation sill — steel wool packed into small gaps (mice can\'t chew through it) topped with caulk, and door sweeps on exterior doors, close off the most common entry points. For an active infestation rather than prevention, that\'s worth booking a pest control visit instead.',
  },
  {
    key: 'loose_cracked_tile',
    keywords: ['fix a tile', 'fix tile', 'loose tile', 'cracked tile', 'broken tile', 'tile came loose', 'replace a tile'],
    title: 'Fixing a loose or cracked floor/wall tile',
    guidance: 'Remove the damaged tile by chipping out the surrounding grout with a grout saw, then carefully break/pry the tile free (wear eye protection) and scrape old thinset/adhesive off the subfloor. Spread new thinset mortar with a notched trowel, set the replacement tile (matched as closely as possible), and use tile spacers to keep even grout lines. Let the thinset cure per the label before grouting the gap, then reseal once the grout cures. A cracked tile over a soft/springy subfloor spot can mean a deeper structural issue worth a professional look.',
  },
];

// Same stopword-aware substring-matching philosophy as
// MaintenanceBotService.matchCatalogFromText — deterministic, not reliant on
// the model reliably naming a topic itself.
export function matchDiyTopicsFromText(text: string): DiyTopic[] {
  const lower = text.toLowerCase();
  const matches = DIY_TOPICS.filter((topic) => topic.keywords.some((k) => lower.includes(k)));
  return matches.slice(0, 2);
}
