/**
 * Bottom padding for the lists the floating add buttons sit over — the Dia
 * card list and the Semana / Mês day sheet (calendar.mobile-views rule 18).
 *
 * The coach's button stack rises 208px above the viewport bottom (Add event:
 * `bottom-40`, 48px tall, over Add class: `bottom-[5.5rem]`, 56px tall). 16px
 * more, so the last card clears the stack with a gap even when the list runs
 * to the very bottom of the viewport.
 */
export const FAB_CLEARANCE_PX = 224;
