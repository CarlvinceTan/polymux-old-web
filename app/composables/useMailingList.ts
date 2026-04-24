export const useMailingList = () => {
  const email = ref('')
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isSubscribed = ref(false)
  const showSuccessMessage = ref(false)

  const validateEmail = (emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(emailValue.trim())
  }

  const subscribe = async (emailValue: string) => {
    error.value = null
    showSuccessMessage.value = false

    // Trim and validate
    const trimmedEmail = emailValue.trim()

    if (!trimmedEmail) {
      error.value = 'Email required'
      return
    }

    if (!validateEmail(trimmedEmail)) {
      error.value = 'Please enter a valid email'
      return
    }

    loading.value = true

    try {
      const response = await $fetch('/api/mailing-list/subscribe', {
        method: 'POST',
        body: {
          email: trimmedEmail,
        },
      })

      isSubscribed.value = true
      showSuccessMessage.value = true
      email.value = ''

      // Auto-dismiss success message after 5 seconds
      setTimeout(() => {
        showSuccessMessage.value = false
      }, 5000)
    }
    catch (err: unknown) {
      if (err instanceof Error) {
        error.value = err.message
      }
      else if (typeof err === 'object' && err !== null && 'data' in err) {
        const errorData = err as any
        error.value = errorData.data?.message || 'Failed to subscribe'
      }
      else {
        error.value = 'Failed to subscribe. Please try again.'
      }
    }
    finally {
      loading.value = false
    }
  }

  const reset = () => {
    email.value = ''
    error.value = null
    isSubscribed.value = false
    showSuccessMessage.value = false
  }

  return {
    email,
    loading,
    error,
    isSubscribed,
    showSuccessMessage,
    subscribe,
    reset,
  }
}
