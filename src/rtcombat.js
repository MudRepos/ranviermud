module.exports.initiate_combat = _initiate_combat;
//TODO: Add strings for sanity damage
//TODO: Implement use of attributes besides damage in combat.
//TODO: Impelment use of combat stance, etc. for strategery.

var LevelUtils = require('./levels').LevelUtils;
var statusUtils = require('./status');

function _initiate_combat(l10n, npc, player, room, npcs, callback) {
  var locale = player.getLocale();
  player.setInCombat(npc);
  npc.setInCombat(player.getName());

  player.sayL10n(l10n, 'ATTACK', npc.getShortDesc(locale));

  // Get the playerWeapon speed or just use a standard 1 sec counter
  var player_speed = player.getAttackSpeed() * 1000;
  var playerWeapon = player.getEquipped('wield', true);

  // Same for npcs
  var npc_speed = npc.getAttackSpeed() * 1000;
  var npcWeapon = npc.getAttack(locale);

  var npc_combat = function() {
    if (!player.isInCombat()) return;

    var player_health = player.getAttribute('health');
    var damage = npc.getDamage();
    var player_sanity = player.getAttribute('sanity');
    var sanityDamage = npc.getSanityDamage();

    damage = calcDamage(damage, player_health);

    if (!damage) {
      if (playerWeapon) playerWeapon.emit('parry', player);
      player.sayL10n(l10n, 'NPC_MISS', npc.getShortDesc(locale));
    } else {
      player.sayL10n(l10n, 'DAMAGE_TAKEN', npc.getShortDesc(locale),
        getDamageString(damage, player_health), npcWeapon);
    }

    if (sanityDamage) {
      sanityDamage = calcDamage(sanityDamage, player_sanity);
      player.setAttribute('sanity', player_sanity - sanityDamage);
    }

    if (player_sanity <= sanityDamage || player_health <= damage) {
      player.setAttribute('health', 1);
      player.setAttribute('sanity', 1);
      return combat_end(false);
    }

    player.combatPrompt({
      target_condition: statusUtils.getHealthText(
        npc.getAttribute('max_health'),
        player, npc)(npc.getAttribute('health')),
      player_condition: statusUtils.getHealthText(
        player.getAttribute('max_health'),
        player)(player.getAttribute('health'))
    });

    setTimeout(npc_combat, npc.getAttackSpeed() * 1000);
  };

  function calcDamage(damage, attr) {
    var range = damage.max - damage.min;
    return Math.min(attr, damage.min + Math.max(0, Math.floor(Math.random() * (range))));
  }

  setTimeout(npc_combat, npc_speed);

  var player_combat = function() {
    var npc_health = npc.getAttribute('health');
    if (npc_health <= 0) {
      return combat_end(true);
    }

    var damage = player.getDamage();
    damage = Math.max(0, Math.min(npc_health, damage.min + Math.max(0, Math.floor(
      Math.random() * (damage.max - damage.min)))));

    if (!damage) {
      if (playerWeapon) playerWeapon.emit('miss', player);
      player.sayL10n(l10n, 'PLAYER_MISS', npc.getShortDesc(locale),
        damage)
    } else {
      if (playerWeapon) playerWeapon.emit('hit', player);
      player.sayL10n(l10n, 'DAMAGE_DONE', npc.getShortDesc(locale),
        getDamageString(damage, npc_health));
    }

    npc.setAttribute('health', npc_health - damage);
    if (npc_health <= damage) {
      return combat_end(true);
    }

    player.combatPrompt({
      target_condition: statusUtils.getHealthText(
        npc.getAttribute('max_health'),
        player, npc)(npc.getAttribute('health')),

      player_condition: statusUtils.getHealthText(
        player.getAttribute('max_health'),
        player)(player.getAttribute('health'))
    });

    setTimeout(player_combat, player.getAttackSpeed() * 1000);
  };

  setTimeout(player_combat, player_speed);

  function getDamageString(damage, health) {
    var percentage = Math.round((damage / health) * 100);

    var damageStrings = {
      3: 'tickles',
      5: 'scratchs',
      8: 'grazes',
      15: 'hits',
      35: 'wounds',
      50: 'devastates',
      75: 'annihilates',
      99: 'eviscerates'
    };

    for (var cutoff in damageStrings) {
      if (percentage <= cutoff) {
        return damageStrings[cutoff];
      }
    }
    return 'slays';
  }

  function combat_end(success) {
    player.setInCombat(false);
    npc.setInCombat(false);
    if (success) {
      player.emit('regen');
      room.removeNpc(npc.getUuid());
      npcs.destroy(npc);
      player.sayL10n(l10n, 'WIN', npc.getShortDesc(locale));

      // hand out experience
      var exp = npc.getAttribute('experience') !== false ?
        npc.getAttribute('experience') : LevelUtils.mobExp(player.getAttribute(
          'level'));

      player.emit('experience', exp);
    } else {
      player.sayL10n(l10n, 'LOSE', npc.getShortDesc(locale));
      player.emit('die');
      npc.setAttribute('health', npc.getAttribute('max_health'));
    }
    player.prompt();
    callback(success);
  }
}