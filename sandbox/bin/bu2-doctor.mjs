#!/usr/bin/env node

import { runDoctorCli } from "../doctor.mjs";

process.exitCode = await runDoctorCli();
