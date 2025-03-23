import { BedrockBot } from './bedrock-bot';
import { MyFunctionHandler } from './action-handler';
import { loadConfig } from './config';
import { v4 as uuidv4 } from 'uuid';

import * as dotenv from 'dotenv';
dotenv.config();

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3').Vec3; // Import Vec3
const { GoalNear, GoalFollow } = goals; // Import GoalNear and GoalFollow from goals

const collectblock = require('mineflayer-collectblock').plugin;

let mcBot: any;
let mcData: any;
let bedrockBot: BedrockBot;

async function startBot() {
  try {
    const config = await loadConfig();

    console.log('Starting bot...', config);

    mcBot = mineflayer.createBot({
      host: config.mcHost,
      username: config.mcUsername,
      auth: config.mcAuth,
      port: config.mcPort,
      version: config.mcVersion
    });

    mcData = require('minecraft-data')(config.mcVersion);

    const functionHandler = new MyFunctionHandler(mcBot, mcData);
    bedrockBot = new BedrockBot(functionHandler, config);

    // Set the chat callback
    bedrockBot.setChatCallback(handleChatMessage);

    // Set the session ID to a random GUID
    bedrockBot.setSessionId(uuidv4());

    mcBot.once('spawn', initializeBot);
    mcBot.on('chat', handleChatCommands);
  } catch (error) {
    console.error('Error starting the bot:', error);
    // Handle the error appropriately
  }
}

startBot();


// Chat callback implementation
function handleChatMessage(message: string) {
  console.log(`Received chat message: ${message}`);
  mcBot.chat(`${message}`)
}

function initializeBot() {
  mcBot.loadPlugin(pathfinder);
  mcBot.loadPlugin(collectblock);

  const defaultMove = new Movements(mcBot)
  defaultMove.allow1by1towers = true // Do not build 1x1 towers when going up
  defaultMove.canDig = true // Disable breaking of blocks when pathing 
  defaultMove.scafoldingBlocks.push(mcBot.registry.itemsByName['acacia_slab'].id) // Add nether rack to allowed scaffolding items
  mcBot.pathfinder.setMovements(defaultMove) // Update the movement instance pathfinder uses

  console.log('Bot spawned');
}



async function handleChatCommands(username: string, message: string) {

  mcBot.time = 6000

  if (username === mcBot.username || 
      message.includes('Teleport')
    ) return;

  // System style messages, for example to set the 
  // weather or set the time seem to end in a ']'
  // let's use this (hacky) to ignore this kind of
  // message. 
  if (message.endsWith(']')) {
    return;
  }

  switch (message) {

    case 'reset':
      bedrockBot.setSessionId(uuidv4());
      mcBot.chat('Session reset');
      break;

    case 'Set the time to 1000]':
      return;

    case 'stop':
      mcBot.chat('Stopping bot...');
      mcBot.clearControlStates()
      break;

    case 'dance': // New custom command
      mcBot.chat('Let me show you my moves!');

      // Dance sequence
      for (let i = 0; i < 3; i++) {
        // Jump
        mcBot.setControlState('jump', true);
        await new Promise(resolve => setTimeout(resolve, 200)); // Jump for 200ms
        mcBot.setControlState('jump', false);

        // Move left
        mcBot.setControlState('left', true);
        await new Promise(resolve => setTimeout(resolve, 300)); // Move left for 300ms
        mcBot.setControlState('left', false);

        // Move right
        mcBot.setControlState('right', true);
        await new Promise(resolve => setTimeout(resolve, 300)); // Move right for 300ms
        mcBot.setControlState('right', false);

        // Look around
        mcBot.look(mcBot.entity.yaw + 45, 0); // Look 45 degrees to the right
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
        mcBot.look(mcBot.entity.yaw - 90, 0); // Look 90 degrees to the left
        await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
        mcBot.look(mcBot.entity.yaw + 45, 0); // Look back to the center
      }

      mcBot.chat('That was fun!');
    break;

  case 'build house':
    mcBot.chat('Building a house...');

    const Vec3 = require('vec3');
    const { GoalNear } = require('mineflayer-pathfinder').goals;

    const width = 4;
    const depth = 4;
    const height = 3;
    let buildOffset = 2;
    let housePos;

    interface Position {
      x: number;
      y: number;
      z: number;
      offset(dx: number, dy: number, dz: number): Position;
      floored(): Position;
    }

    interface Block {
      name: string;
    }

    function isBuildAreaClear(pos: Position): boolean {
      for (let x = -1; x <= width + 1; x++) {
        for (let y = 0; y <= height + 2; y++) {
          for (let z = -1; z <= depth + 1; z++) {
            const checkPos: Position = pos.offset(x, y, z);
            const block: Block | null = mcBot.blockAt(checkPos);
            if (block && block.name !== 'air') return false;
          }
        }
      }
      return true;
    }

    // Find clear area
    do {
      housePos = mcBot.entity.position.offset(buildOffset, 0, buildOffset).floored();
      buildOffset += 10;
    } while (!isBuildAreaClear(housePos) && buildOffset < 100);

    const blocksToPlace = [];

    // Floor
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        const pos = housePos.offset(x, 0, z);
        blocksToPlace.push({ pos, command: `setblock ${pos.x} ${pos.y} ${pos.z} oak_planks` });
      }
    }

    // Walls
    for (let y = 1; y <= height; y++) {
      for (let x = 0; x < width; x++) {
        for (let z = 0; z < depth; z++) {
          const isEdge = x === 0 || x === width - 1 || z === 0 || z === depth - 1;
          const isCorner = (x === 0 || x === width - 1) && (z === 0 || z === depth - 1);
          const frontMiddle = x === Math.floor(width / 2) && z === 0 && y === 1;
          const windowLevel = y === 2 && !isCorner;

          if (isEdge && !frontMiddle) {
            const type = windowLevel ? 'glass' : 'oak_planks';
            const pos = housePos.offset(x, y, z);
            blocksToPlace.push({ pos, command: `setblock ${pos.x} ${pos.y} ${pos.z} ${type}` });
          }
        }
      }
    }

    // Roof
    for (let x = -1; x <= width; x++) {
      for (let z = -1; z <= depth; z++) {
        const pos = housePos.offset(x, height + 1, z);
        blocksToPlace.push({ pos, command: `setblock ${pos.x} ${pos.y} ${pos.z} oak_planks` });
      }
    }

    // Door
    const doorPos = housePos.offset(Math.floor(width / 2), 1, 0);
    blocksToPlace.push({ pos: doorPos, command: `setblock ${doorPos.x} ${doorPos.y} ${doorPos.z} oak_door` });

    // Fakes the building action step-by-step
    for (const { pos, command } of blocksToPlace) {
      try {
        const approachPos = pos.offset(0, 0, -1);
        await mcBot.pathfinder.goto(new GoalNear(approachPos.x, approachPos.y, approachPos.z, 2));
        await mcBot.lookAt(pos.offset(0.5, 0.5, 0.5));
        mcBot.swingArm('right', true);

        await mcBot.waitForTicks(1);
        await mcBot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z} command_block`);
        await mcBot.waitForTicks(1);
        await mcBot.setCommandBlock(pos, command, { mode: 1, alwaysActive: true });
        await mcBot.waitForTicks(1);
      } catch {
        // skip if failed
      }
    }

    mcBot.chat('House built!');
  break;



      
       
      

    case 'follow me': // Command to make the bot follow the player
    mcBot.chat('Following you!');
  
    // Get the player entity
    const player = mcBot.players[username]?.entity;
    if (player) {
      // Set the bot's goal to follow the player
      mcBot.pathfinder.setGoal(new GoalFollow(player, 1), true); // Follow within 1 block distance
    } else {
      mcBot.chat('I can\'t see you!');
    }
    break;
  
  case 'stop follow': // Command to make the bot stop following
    mcBot.chat('Stopped following!');
    mcBot.pathfinder.stop(); // Stop all pathfinding
    break;

    default:
      const prompt = `${username} says: ${message}`;
      await bedrockBot.chatWithAgent(prompt);
  }

}