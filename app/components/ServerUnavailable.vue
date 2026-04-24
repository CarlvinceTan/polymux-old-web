<template>
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-neutral-50 to-white px-6">
    <div class="flex max-w-md flex-col items-center text-center">
      <div class="mb-10 flex justify-center" aria-hidden="true">
        <svg
          class="size-36 text-neutral-400"
          viewBox="16 34 88 52"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M24 38h72v20H24V38z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            class="text-neutral-300"
            fill="currentColor"
            fill-opacity="0.06"
          />
          <path
            d="M24 62h72v20H24V62z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            class="text-neutral-300"
            fill="currentColor"
            fill-opacity="0.06"
          />
          <circle cx="36" cy="48" r="2" fill="currentColor" class="text-neutral-400" />
          <circle cx="36" cy="72" r="2" fill="currentColor" class="text-neutral-400" />
        </svg>
      </div>

      <h1 class="text-xl font-semibold tracking-tight text-neutral-950">
        Server Unavailable
      </h1>

      <p class="mt-3 max-w-sm text-body-md leading-relaxed text-neutral-500">
        Unable to reach the server. This may be due to maintenance or a network issue.
      </p>
    </div>
  </div>
</template>
