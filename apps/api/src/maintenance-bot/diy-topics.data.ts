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
    keywords: ['clogged drain', 'slow drain', 'drain clog', 'unclog', 'slow to drain'],
    title: 'Clearing a slow or clogged drain',
    guidance: 'Try a plunger first (cover any overflow opening for a sink). If that fails, remove and clean the drain stopper, then try a zip-it tool or a mixture of baking soda and vinegar followed by hot water. Avoid chemical drain cleaners on older pipes. If the clog persists after these steps, it may be further down the line and worth a professional look.',
  },
  {
    key: 'gfci_breaker',
    keywords: ['gfci', 'tripped outlet', 'tripped breaker', 'outlet not working', 'reset breaker'],
    title: 'Resetting a tripped GFCI outlet or breaker',
    guidance: 'For a GFCI outlet, press the "Reset" button firmly (you should hear/feel a click). For a tripped breaker, switch it fully to OFF before switching back to ON. If it trips again immediately, unplug whatever was running on that circuit first — repeated tripping can mean an overloaded circuit or a real fault, which is worth having looked at rather than repeatedly reset.',
  },
  {
    key: 'hvac_filter',
    keywords: ['hvac filter', 'furnace filter', 'air filter', 'ac filter'],
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
    keywords: ['running toilet', 'toilet keeps running', 'toilet flapper', 'toilet fill valve'],
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
];

// Same stopword-aware substring-matching philosophy as
// MaintenanceBotService.matchCatalogFromText — deterministic, not reliant on
// the model reliably naming a topic itself.
export function matchDiyTopicsFromText(text: string): DiyTopic[] {
  const lower = text.toLowerCase();
  const matches = DIY_TOPICS.filter((topic) => topic.keywords.some((k) => lower.includes(k)));
  return matches.slice(0, 2);
}
