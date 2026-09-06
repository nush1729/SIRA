/**
 * Engine facade — routes to A's real scheduler or the stub.
 *
 * Set USE_ENGINE_STUB=true in .env to fall back to the deterministic
 * stub (useful when you want fast, predictable smoke-test results).
 * By default, the real engine is used.
 */

import * as stub from './engine-stub';
import * as realScheduler from './scheduler';
import * as realSelection from './selection';

const useStub = process.env.USE_ENGINE_STUB === 'true';

export const generateSlots = useStub ? stub.generateSlots : realScheduler.generateSlots;
export const validateSlot  = useStub ? stub.validateSlot  : realScheduler.validateSlot;
export const pickPanel     = useStub ? stub.pickPanel     : realSelection.pickPanel;
