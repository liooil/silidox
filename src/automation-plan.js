// Declarative automation export shared by the browser and a future local runner.
(function defineAutomationPlan(global) {
  const { CONTROLLERS, CONTROL_CONTEXTS, MINING_RULES, SURVIVAL_RULES } = global.SilidoxData;
  const SCHEMA = "silidox.automation-plan.v1";

  function createPlan(state, programs) {
    const jobs = Object.values(state.controllers)
      .filter((controller) => controller.installed)
      .map((controller) => {
        const definition = CONTROLLERS[controller.id];
        const context = CONTROL_CONTEXTS[definition.programId];
        const program = programs?.[definition.programId] ?? [];
        return {
          id: definition.programId,
          device: controller.id,
          mode: controller.mode,
          scan_interval_ms: SURVIVAL_RULES.controllerScanMs,
          program_ir:
            controller.mode === "ladder" ? normalizeProgram(program, context) : [],
          estimated_scan_cost:
            controller.mode === "ladder"
              ? estimateProgramScanCost(program)
              : definition.presetLoad,
          physical_limits: physicalLimits(controller.id),
        };
      });

    return {
      schema: SCHEMA,
      created_at: new Date().toISOString(),
      simulation_elapsed_ms: state.clock.elapsedMs,
      resources: {
        energy: round(state.resources.energy),
        wood: round(state.resources.wood),
        material: round(state.resources.material),
        ore: round(state.resources.ore),
        parts: round(state.resources.parts),
      },
      jobs,
    };
  }

  function normalizeProgram(program, context) {
    if (!Array.isArray(program) || !context) return [];
    const inputs = new Set(context.inputs.map((input) => input.id).concat(["0", "1"]));
    const outputs = new Set(context.outputs.map((output) => output.id));
    return program
      .filter((rung) => rung && rung.enabled !== false && outputs.has(rung.coil))
      .map((rung) => ({
        contacts: Array.isArray(rung.contacts)
          ? rung.contacts
              .filter((contact) => inputs.has(String(contact.pin)))
              .map((contact) => ({
                op: contact.op === "XIO" ? "XIO" : "XIC",
                pin: String(contact.pin),
              }))
          : [],
        coil: rung.coil,
      }))
      .filter((rung) => rung.contacts.length > 0);
  }

  function estimateProgramScanCost(program) {
    if (!Array.isArray(program) || program.length === 0) return 0;
    return program.reduce((total, rung) => {
      if (!rung || rung.enabled === false) return total;
      return total + 1 + (Array.isArray(rung.contacts) ? rung.contacts.length : 0);
    }, 0);
  }

  function physicalLimits(controllerId) {
    if (controllerId === "heart") {
      return {
        max_actions_per_second: 1,
        energy_per_action: SURVIVAL_RULES.manualHeartbeatEnergy,
      };
    }
    if (controllerId === "drive") {
      return {
        max_actions_per_second: 1,
        energy_per_action: SURVIVAL_RULES.moveEnergy,
      };
    }
    if (controllerId === "excavator") {
      return {
        max_actions_per_second: 1,
        energy_per_action: MINING_RULES.digEnergy,
        branch_factor: 2,
        max_depth: MINING_RULES.maxDepth,
      };
    }
    return {
      max_actions_per_second: 1,
      energy_per_action: SURVIVAL_RULES.pickupEnergy,
    };
  }

  function validatePlan(plan) {
    if (!plan || plan.schema !== SCHEMA || !Array.isArray(plan.jobs)) return false;
    return plan.jobs.every(
      (job) =>
        typeof job.id === "string" &&
        ["manual", "preset", "ladder"].includes(job.mode) &&
        Array.isArray(job.program_ir) &&
        Number.isFinite(job.estimated_scan_cost),
    );
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }

  global.SilidoxAutomationPlan = Object.freeze({
    SCHEMA,
    createPlan,
    estimateProgramScanCost,
    validatePlan,
  });
})(globalThis);
