export const useMailingList = () => {
  const { t } = useI18n()
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
      error.value = t('blog.emailRequired')
      return
    }

    if (!validateEmail(trimmedEmail)) {
      error.value = t('blog.invalidEmail')
      return
    }

    loading.value = true

    try {
      await $fetch('/api/mailing-list/subscribe', {
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
        const errorData = err as { data?: { message?: string } }
        error.value = errorData.data?.message || t('blog.subscribeFailed')
      }
      else {
        error.value = t('blog.subscribeFailedRetry')
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
