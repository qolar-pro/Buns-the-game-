'use client';

/**
 * Talking to a villager: their stock, and what the village needs.
 *
 * Deliberately one panel rather than two screens. A trade and a request are the
 * same gesture — hand something over, get something back — and splitting them
 * would mean a player who walked into a village had to find out which of two
 * buttons the thing they wanted was behind.
 *
 * Every action goes through the pure systems in systems/trade.ts and
 * systems/requests.ts, so the rules live in one tested place rather than in a
 * component. The crafting UI once reimplemented crafting; this does not repeat
 * that.
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ItemIcon } from './ItemIcon';
import { countItem } from '@/src/game/systems/inventory';
import { offersFor, trade } from '@/src/game/systems/trade';
import { handIn, requestsFor } from '@/src/game/systems/requests';
import { soundManager } from '@/lib/SoundManager';
import type { GameState, ItemType, Npc } from '@/src/game/core/types';

/** What each role says when you walk up to them. */
const GREETING: Record<Npc['role'], string> = {
  villager: 'Morning. Got anything worth having?',
  trader: 'Everything here has a price, and the price is goods.',
  elder: 'Sit, if you like. Or trade, if you would rather.',
};

const ROLE_LABEL: Record<Npc['role'], string> = {
  villager: 'Villager',
  trader: 'Trader',
  elder: 'Elder',
};

function Stack({ type, count, have }: { type: ItemType; count: number; have?: number }) {
  const short = have !== undefined && have < count;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative inline-block h-7 w-7 shrink-0">
        <ItemIcon type={type} size={28} />
      </span>
      <span className={short ? 'text-red-400' : 'text-neutral-200'}>
        {count}
        {have !== undefined && <span className="text-neutral-500"> / {have}</span>}
      </span>
    </span>
  );
}

export interface TradePanelProps {
  state: GameState;
  npc: Npc;
  refreshUI: () => void;
  onClose: () => void;
}

export function TradePanel({ state, npc, refreshUI, onClose }: TradePanelProps) {
  const [note, setNote] = useState<string>(GREETING[npc.role]);
  const offers = offersFor(npc);
  const requests = requestsFor(state, npc.village);

  const doTrade = (id: string) => {
    const result = trade(state, npc, id);
    setNote({
      ok: 'Pleasure doing business.',
      'missing-goods': "You don't have that to give.",
      'no-room': 'Your pack is full.',
      'unknown-offer': 'I don\'t deal in that.',
    }[result]);
    if (result === 'ok') soundManager.playCraft();
    refreshUI();
  };

  const doHandIn = (id: string) => {
    const result = handIn(state, npc.village, id);
    setNote({
      ok: 'That will do nicely. Take this.',
      'missing-goods': 'Not enough yet. Come back.',
      'no-room': 'Your pack is full.',
      'already-done': 'You have already seen to that.',
      unknown: 'I asked for no such thing.',
    }[result]);
    if (result === 'ok') soundManager.playCraft();
    refreshUI();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 16, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border-2 border-[#7c4d23] bg-[#1c1510] font-mono text-sm text-neutral-200 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b-2 border-[#7c4d23] bg-[#2a1f16] px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-[#fed859]">{npc.name}</h2>
            <p className="text-xs text-neutral-400">{ROLE_LABEL[npc.role]}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stop talking"
            className="rounded border border-[#7c4d23] px-3 py-1 text-xs hover:bg-white/10"
          >
            LEAVE
          </button>
        </header>

        <p className="border-b border-[#7c4d23]/50 px-4 py-2 text-xs italic text-neutral-400">{note}</p>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#fed859]">Trade</h3>
          <ul className="mb-5 space-y-1.5">
            {offers.map((offer) => {
              const have = countItem(state, offer.give.type);
              const can = have >= offer.give.count;
              return (
                <li key={offer.id}>
                  <button
                    type="button"
                    disabled={!can}
                    onClick={() => doTrade(offer.id)}
                    aria-label={`Trade ${offer.give.count} ${offer.give.type.replace(/_/g, ' ')} for ${offer.get.count} ${offer.get.type.replace(/_/g, ' ')}`}
                    className={`flex w-full flex-wrap items-center gap-2 rounded border px-3 py-2 text-left ${
                      can
                        ? 'border-[#7c4d23] hover:bg-white/10'
                        : 'border-neutral-800 opacity-50'
                    }`}
                  >
                    <Stack type={offer.give.type} count={offer.give.count} have={have} />
                    <span className="text-neutral-500">&rarr;</span>
                    <Stack type={offer.get.type} count={offer.get.count} />
                  </button>
                </li>
              );
            })}
          </ul>

          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#fed859]">Asking for</h3>
          <ul className="space-y-1.5">
            {requests.map((request) => {
              const can = !request.done && request.have >= request.want.count;
              return (
                <li key={request.id}>
                  <button
                    type="button"
                    disabled={!can}
                    onClick={() => doHandIn(request.id)}
                    aria-label={`Hand in ${request.want.count} ${request.want.type.replace(/_/g, ' ')} for ${request.reward.count} ${request.reward.type.replace(/_/g, ' ')}`}
                    className={`w-full rounded border px-3 py-2 text-left ${
                      request.done
                        ? 'border-neutral-800 opacity-40'
                        : can
                          ? 'border-[#fed859] hover:bg-white/10'
                          : 'border-neutral-800 opacity-70'
                    }`}
                  >
                    <p className="mb-1.5 text-xs italic text-neutral-400">
                      {request.done ? 'Done. Thank you.' : request.text}
                    </p>
                    <span className="flex flex-wrap items-center gap-2">
                      <Stack type={request.want.type} count={request.want.count} have={request.have} />
                      <span className="text-neutral-500">&rarr;</span>
                      <Stack type={request.reward.type} count={request.reward.count} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default TradePanel;
